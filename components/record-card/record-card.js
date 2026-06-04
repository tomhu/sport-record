Component({
  properties: {
    record: {
      type: Object,
      value: {}
    }
  },

  methods: {
    onDelete() {
      const that = this;
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这条运动记录吗？',
        confirmColor: '#F44336',
        success(res) {
          if (res.confirm) {
            that.triggerEvent('delete', { id: that.data.record.id });
          }
        }
      });
    }
  }
});
