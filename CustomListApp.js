(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define('Rally.apps.customlist.CustomListApp', {
        extend: 'Rally.app.GridBoardApp',
        requires: [
            'Deft.Promise',
            'Rally.apps.customlist.Settings',
            'Rally.data.BulkRecordUpdater',
            'Rally.data.ModelTypes',
            'Rally.data.PreferenceManager',
            'Rally.data.util.Sorter',
            'Rally.data.wsapi.Filter',
            'Rally.ui.gridboard.plugin.GridBoardInlineFilterControl',
            'Rally.ui.gridboard.plugin.GridBoardSharedViewControl',
            'Rally.ui.notify.Notifier',
            'Rally.util.String'
        ],

        disallowedAddNewTypes: ['user', 'userprofile', 'useriterationcapacity', 'testcaseresult', 'task', 'scmrepository', 'project', 'changeset', 'change', 'builddefinition', 'build', 'program'],
        orderedAllowedPageSizes: [10, 25, 50, 100, 200],
        readOnlyGridTypes: ['build', 'change', 'changeset'],
        statePrefix: 'customlist',
        allowExpansionStateToBeSaved: false,
        isEditable: true,

        config: {
            defaultSettings: {
                showControls: true,
                type: 'portfolioitem/feature'
            }
        },

        initComponent: function () {
            this.appName = 'CustomList-' + this.getAppId();
            if (this.defaultSettings.url) {
                Ext.apply(this.defaultSettings, { type: this.defaultSettings.url });
            }
            this.callParent(arguments);
        },

        getSettingsFields: function() {
            return Rally.apps.customlist.Settings.getFields(this);
        },

        loadModelNames: function () {
            this.modelNames = _.compact(this.getTypeSetting());
            this._setColumnNames(this._getColumnNamesSetting());
            return Deft.Promise.when(this.modelNames);
        },

        addGridBoard: function () {
            this.callParent(arguments);

            if (!this.getSetting('showControls')) {
                this.gridboard.getHeader().hide();
            }
        },

        loadGridBoard: function () {
            if (_.isEmpty(this.modelNames)) {
                Ext.defer(function () {
                    this.fireEvent('settingsneeded', this);
                    this.publishComponentReady();
                }, 1, this);
            } else {
                this.enableAddNew = this._shouldEnableAddNew();
                this.enableRanking = this._shouldEnableRanking();
                this.callParent(arguments);
            }
        },

        getGridConfig: function () {
            var config = _.merge(this.callParent(arguments), {
                allColumnsStateful: true,
                enableEditing: _.intersection(this.readOnlyGridTypes, this.getTypeSetting()).length === 0,
                listeners: {
                    beforestaterestore: this._onBeforeGridStateRestore,
                    beforestatesave: this._onBeforeGridStateSave,
                    scope: this
                },
                pagingToolbarCfg: {
                    hidden: !this.getSetting('showControls'),
                    pageSizes: this.orderedAllowedPageSizes
                }
            });

            var invalidQueryFilters = Rally.util.Filter.findInvalidSubFilters(this._getQueryFilter(), this.models);
            if (invalidQueryFilters.length) {
                config.store.on('beforeload', function (store) {
                    Ext.defer(function () {
                        store.fireEvent('load', store, store.getRootNode(), [], true);
                    }, 1);
                    return false;
                });
                this._showInvalidQueryMessage(config, _.map(invalidQueryFilters, function (filter) {
                    return 'Could not find the attribute "'+ filter.property.split('.')[0] +'" on type "'+ this.models[0].displayName +'" in the query segment "'+ filter.toString() + '"';
                }, this));
            }

            return config;
        },

        getColumnCfgs: function() {
            return _.union(this.callParent(arguments), _.isEmpty(this.columnNames) && this.enableRanking ? ['DragAndDropRank'] : []);
        },

        getFilterControlConfig: function () {
            return _.merge(this.callParent(arguments), {
                listeners: {
                    beforestaterestore: {
                        fn: this._onBeforeFilterButtonStateRestore,
                        scope: this
                    }
                }
            });
        },

        getGridBoardCustomFilterControlConfig: function() {
            var context = this.getContext();
            var isArtifactModel = this.models[0].isArtifact();
            var blackListFields = isArtifactModel ? ['ModelType', 'PortfolioItemType', 'LastResult'] : ['ArtifactSearch', 'ModelType'];
            var whiteListFields = isArtifactModel ? ['Milestones', 'Tags'] : [];

            if (this.models[0].isProject()) {
                blackListFields.push('SchemaVersion');
            } else if (this.models[0].isRelease()) {
                blackListFields.push('ChildrenPlannedVelocity', 'Version');
            }

            var config = {
                ptype: 'rallygridboardinlinefiltercontrol',
                inlineFilterButtonConfig: {
                    stateful: true,
                    stateId: context.getScopedStateId('custom-list-inline-filter'),
                    legacyStateIds: [
                        this.getScopedStateId('owner-filter'),
                        this.getScopedStateId('custom-filter-button')
                    ],
                    filterChildren: true,
                    inlineFilterPanelConfig: {
                        quickFilterPanelConfig: {
                            defaultFields: isArtifactModel ? ['ArtifactSearch', 'Owner'] : [],
                            addQuickFilterConfig: {
                                blackListFields: blackListFields,
                                whiteListFields: whiteListFields
                            }
                        },
                        advancedFilterPanelConfig: {
                            advancedFilterRowsConfig: {
                                propertyFieldConfig: {
                                    blackListFields: blackListFields,
                                    whiteListFields: whiteListFields
                                }
                            }
                        }
                    }
                }
            };

            if (isArtifactModel) {
                config.inlineFilterButtonConfig.modelNames = this.modelNames;
            } else {
                config.inlineFilterButtonConfig.model = this.models[0];
            }

            return config;
        },

        getSharedViewConfig: function() {
            var context = this.getContext();
            return {
                ptype: 'rallygridboardsharedviewcontrol',
                sharedViewConfig: {
                    stateful: true,
                    stateId: context.getScopedStateId('custom-list-shared-view'),
                    enableUrlSharing: this.isFullPageApp !== false
                }
            };
        },

        getGridBoardConfig: function () {
            var config = this.callParent(arguments);
            return _.merge(config, {
                listeners: {
                    viewchange: function() {
                        this.loadGridBoard();
                    },
                    filterchange: function() {
                        this.gridboard.getGridOrBoard().noDataPrimaryText = undefined;
                        this.gridboard.getGridOrBoard().noDataSecondaryText = undefined;
                    },
                    scope: this
                }
            });
        },

        onTreeGridReady: function (grid) {
            if (grid.store.getTotalCount() > 10) {
                this.gridboard.down('#pagingToolbar').show();
            }

            this.callParent(arguments);
        },

        getGridStoreConfig: function () {
            var sorters = this._getValidSorters(Rally.data.util.Sorter.sorters(this.getSetting('order')));

            if (_.isEmpty(sorters)) {
                var rankField = this.getContext().getWorkspace().WorkspaceConfiguration.DragDropRankingEnabled ? 'DragAndDropRank' : 'Rank';
                var defaultSort = Rally.data.ModelTypes.areArtifacts(this.modelNames) ? rankField : Rally.data.util.Sorter.getDefaultSort(this.modelNames[0]);

                sorters = Rally.data.util.Sorter.sorters(defaultSort);
            }

            return {
                listeners: {
                    warning: {
                        fn: this._onGridStoreWarning,
                        scope: this
                    }
                },
                pageSize: 10,
                sorters: sorters
            };
        },

        getAddNewConfig: function () {
            var config = {
                minWidth: 700,
                openEditorAfterAddFailure: false,
                margin: 0
            };

            return _.merge(this.callParent(arguments), config);
        },

        getFieldPickerConfig: function () {
            return _.merge(this.callParent(arguments), {
                buttonConfig: {
                    disabled: !this._userHasPermissionsToEditPanelSettings()
                },
                gridAlwaysSelectedValues: function () { return []; },
                gridFieldBlackList: this._shouldEnableRanking() ? [] : ['Rank']
            });
        },

        getPermanentFilters: function () {
            return this._getQueryFilter().concat(this._getTimeboxScopeFilter()).concat(this._getProjectFilter());
        },

        onTimeboxScopeChange: function() {
            this.callParent(arguments);
            this.loadGridBoard();
        },

        clearFiltersAndSharedViews: function() {
            var context = this.getContext();
            if (this.gridboard) {
                this.gridboard.down('rallyinlinefilterpanel').clear();
                this.gridboard.down('rallysharedviewcombobox').reset();
            }

            Ext.create('Rally.data.wsapi.Store', {
                model: Ext.identityFn('preference'),
                autoLoad: true,
                filters: [
                    {property: 'AppId', value: context.getAppId()},
                    {property: 'Type', value: 'View'},
                    {property: 'Workspace', value: context.getWorkspace()._ref}
                ],
                context: context.getDataContext(),
                listeners: {
                    load: function(store, records) {
                        if(!_.isEmpty(records)) {
                            var batchStore = Ext.create('Rally.data.wsapi.batch.Store', {
                                requester: this,
                                data: records
                            });
                            batchStore.removeAll();
                            batchStore.sync();
                        }
                        store.destroyStore();
                    },
                    scope: this
                }
            });
        },

        getTypeSetting: function() {
            return (this.getSetting('type') || this.getSetting('url') || '').toLowerCase().split(',');
        },

        _getColumnNamesSetting: function() {
            return this.getSetting('columnNames') ||
              (this.getSetting('fetch') || '').split(',');
        },

        _getQueryFilter: function () {
            var query = new Ext.Template(this.getSetting('query')).apply({
                projectName: this.getContext().getProject().Name,
                projectOid: this.getContext().getProject().ObjectID,
                user: this.getContext().getUser()._ref
            });
            if (query) {
                try {
                    return [ Rally.data.wsapi.Filter.fromQueryString(query) ];
                } catch(e) {
                    Rally.ui.notify.Notifier.showError({ message: e.message });
                }
            }
            return [];
        },

        _getProjectFilter: function () {
            return this.modelNames[0].toLowerCase() === 'milestone' ? [
                Rally.data.wsapi.Filter.or([
                    { property: 'Projects', operator: 'contains', value: this.getContext().getProjectRef() },
                    { property: 'TargetProject', operator: '=', value: null }
                ])
            ] : [];
        },

        _getTimeboxScopeFilter: function () {
            var timeboxScope = this.getContext().getTimeboxScope();
            var hasTimeboxField = timeboxScope && _.any(this.models, timeboxScope.isApplicable, timeboxScope);
            return hasTimeboxField ? [ timeboxScope.getQueryFilter() ] : [];
        },

        _shouldEnableAddNew: function() {
            return _.intersection(this.disallowedAddNewTypes, this.getTypeSetting()).length === 0;
        },

        _shouldEnableRanking: function() {
            return !_.contains(this.getTypeSetting(), 'task');
        },

        _setColumnNames: function (columnNames) {
            this.columnNames = _.compact(_.isString(columnNames) ? columnNames.split(',') : columnNames);
        },

        _onBeforeFilterButtonStateRestore:  function (filterButton, state) {
            if (state && state.filters && state.filters.length) {
                var stateFilters = _.map(state.filters, function (filterStr) {
                    return Rally.data.wsapi.Filter.fromQueryString(filterStr);
                });
                var validFilters = Rally.util.Filter.removeNonapplicableTypeSpecificFilters(stateFilters, this.models);
                state.filters = _.invoke(validFilters, 'toString');
            }
        },

        _hasViewSelected: function() {
            var sharedViewConfig = this.getSharedViewConfig().sharedViewConfig;
            if (sharedViewConfig && sharedViewConfig.stateId) {
                var value = (Ext.state.Manager.get(sharedViewConfig.stateId) || {}).value;

                return !_.isEmpty(value);
            }
            return false;
        },

        _onBeforeGridStateRestore: function (grid, state) {
            if (!state) {
                return;
            }

            if (state.columns) {
                var appScopedColumnNames = this._getValidUuids(grid, this.getColumnCfgs());
                var userScopedColumnNames = this._getValidUuids(grid, state.columns);

                if (this._hasViewSelected()) {
                    state.columns = userScopedColumnNames;
                } else {

                    // Get the columns that are present in the app scope and not in the user scope
                    var differingColumns = _.difference(appScopedColumnNames, userScopedColumnNames);

                    // If there are columns in the app scope that are not in the
                    // user scope, append them to the user scope to preserve
                    // user scope column order
                    if (differingColumns.length > 0) {
                        state.columns = state.columns.concat(differingColumns);
                    }

                    // Filter out any columns that are in the user scope that are not in the
                    // app scope
                    state.columns = _.filter(state.columns, function (column) {
                        return _.contains(appScopedColumnNames, _.isObject(column) ? column.dataIndex : column);
                    }, this);
                }
            }

            if (state.sorters) {
                state.sorters = this._getValidSorters(state.sorters);
                if (_.isEmpty(state.sorters)) {
                    delete state.sorters;
                }
            }
        },

        _getValidUuids: function(grid, columns) {
            return _.reduce(columns, function(result, column) {
                var dataIndex =  this._getColumnDataIndex(column);
                var field = this._getModelField(grid, dataIndex);

                if (field) {
                    result.push(dataIndex);
                }

                return result;
            }, [], this);
        },

        _getModelField: function(grid, dataIndex) {
            return grid.getModels()[0].getField(dataIndex);
        },

        _getColumnDataIndex: function(column) {
            return _.isObject(column) ? column.dataIndex : column;
        },

        _onBeforeGridStateSave: function (grid, state) {
            var newColumnNames = this._getColumnNamesFromState(state);

            if (!_.isEmpty(newColumnNames)) {
                this._setColumnNames(newColumnNames);

                if (this._userHasPermissionsToEditPanelSettings()) {
                    this.updateSettingsValues({
                        settings: {
                            columnNames: newColumnNames.join(',')
                        }
                    });
                }
            }
        },

        _onGridStoreWarning: function(store, warnings, operation) {
            var couldNotParseWarnings = _.filter(warnings, function(warning){
                return Rally.util.String.startsWith(warning, 'Could not parse ');
            });
            if(couldNotParseWarnings.length) {
                _.assign(operation.resultSet, {
                    count: 0,
                    records: [],
                    total: 0,
                    totalRecords: 0
                });
                this._showInvalidQueryMessage(this.gridboard.getGridOrBoard(), couldNotParseWarnings);
            }
        },

        _showInvalidQueryMessage: function(gridOrGridConfig, secondaryTextStrings) {
            gridOrGridConfig.noDataPrimaryText = 'Invalid Query';
            gridOrGridConfig.noDataSecondaryText = _.map(secondaryTextStrings, function(str){
                return '<div>' + str + '</div>';
            }).join('');
        },

        _getValidSorters: function (sorters) {
            return _.filter(sorters, function (sorter) {
                return _.any(this.models, function (model) {
                    var field = model.getField(sorter.property);
                    return field && field.sortable;
                });
            }, this);
        },

        _userHasPermissionsToEditPanelSettings: function () {
            return this.isEditable;
        },

        _getColumnNamesFromState: function (state) {
            return _(state && state.columns).map(function (newColumn) {
                return _.isObject(newColumn) ? newColumn.dataIndex : newColumn;
            }).compact().value();
        }
    });
})();
