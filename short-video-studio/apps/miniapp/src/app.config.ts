export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/records/index',
    'pages/profile/index',
    'pages/photo/index',
    'pages/tasks/index',
    'pages/webview/index',
    'pages/notifications/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#f4f6f2',
    navigationBarTitleText: '智助乖乖',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f4f6f2'
  },
  tabBar: {
    color: '#82918b',
    selectedColor: '#1d8b73',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '工作台'
      },
      {
        pagePath: 'pages/records/index',
        text: '内容'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的'
      }
    ]
  }
})
