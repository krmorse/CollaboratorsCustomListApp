(function () {

    Ext.apply(Rally.ui.renderer.RendererFactory.fieldTemplates, {
        collaborators: function() {
            return Ext.create('CollaboratorsTemplate');
        }
    });

    Ext.define('CollaboratorsTemplate', {
        extend: 'Rally.ui.renderer.template.status.StatusTemplate',

        inheritableStatics: {
            onClick: function(event, ref) {
                Rally.ui.renderer.template.status.StatusTemplate.onClick(event, ref, {
                    field: 'Collaborators'
                });
            }
        },

        constructor: function() {
            this.callParent([
                '<tpl if="this._getCollaboratorsCount(values) &gt; 0">',
                    '<a onclick="{[this._getOnClick(values)]}">',
                        '<span class="collaborators-cnt">{[this._getCollaboratorsCount(values)]}</span>',
                    '</a>',
                '</tpl>'
            ]);
        },

        _getCollaboratorsCount: function (recordData) {
            return recordData.Collaborators.Count;
        },

        _getOnClick: function(recordData) {
            return 'CollaboratorsTemplate.onClick(event, \'' + recordData._ref + '\'); return false;';
        }
    });
})();
