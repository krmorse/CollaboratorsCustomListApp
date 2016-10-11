(function() {

    Ext.apply(Rally.ui.popover.PopoverFactory.popovers, {
        Collaborators: function(config) {
            return Ext.create('CollaboratorsPopover', Ext.merge({
                context: {
                    workspace: config.record.get('Workspace')._ref,
                    project: null
                }
            }, config));
        }
    });

    Ext.define('CollaboratorsPopover', {
        extend: 'Rally.ui.popover.ListViewPopover',

        id: 'collaborators-popover',
        cls: 'collaborators-popover',
        title: 'Collaborators',

        constructor: function(config) {
            config.listViewConfig = Ext.merge({
                addNewConfig: null,
                gridConfig: {
                    enableEditing: false,
                    storeConfig: {
                        context: config.context,
                        fetch: ['FirstName', 'LastName', 'EmailAddress']
                    },
                    columnCfgs: [
                        {
                            dataIndex: 'FirstName',
                            width: 200
                        },
                        {
                            dataIndex: 'LastName',
                            width: 200
                        },
                        {
                            dataIndex: 'EmailAddress',
                            flex: 1
                        }
                    ]
                },
                model: 'user',
                childField: 'Collaborators'
            }, config.listViewConfig);

            this.callParent(arguments);
        }
    });
})();
