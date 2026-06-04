Component({
  properties: {
    record: {
      type: Object,
      value: {}
    }
  },

  methods: {
    onTapCard: function () {
      var r = this.data.record;
      // 有轨迹记录的骑行 → 跳转轨迹回放
      if (r.hasTrack && r.sportType === 'cycling') {
        wx.navigateTo({
          url: '/pages/cycling-detail/cycling-detail?recordId=' + r.id
        });
      }
    },

    onDelete: function () {
      var that = this;
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这条运动记录吗？',
        confirmColor: '#F44336',
        success: function (res) {
          if (res.confirm) {
            that.triggerEvent('delete', { id: that.data.record.id });
          }
        }
      });
    }
  }
});
