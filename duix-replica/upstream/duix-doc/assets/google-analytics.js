(function () {
  function initOnRouteChange() {
    // 异步加载 GA 脚本
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-XKHVFX7R8L";
    document.head.appendChild(script);

    // 初始化数据层
    window.dataLayer = window.dataLayer || [];

    function gtag() {
      dataLayer.push(arguments);
    }

    gtag("js", new Date());
    gtag("config", "G-XKHVFX7R8L");

    /**
     * 自定义追踪事件
     */
    window.MintlifyGA = {
      // 追踪页面浏览
      trackPageView: function (pagePath, pageTitle) {
        gtag("event", "page_view", {
          page_path: pagePath,
          page_title: pageTitle || document.title,
        });
      },

      // 追踪自定义事件
      trackEvent: function (eventName, eventData) {
        gtag("event", eventName, eventData || {});
      },

      // 追踪导航点击
      trackNavigation: function (navItem, navType) {
        gtag("event", "navigation_click", {
          nav_item: navItem,
          nav_type: navType,
        });
      },

      // 追踪按钮点击
      trackButtonClick: function (buttonName, buttonLabel) {
        gtag("event", "button_click", {
          button_name: buttonName,
          button_label: buttonLabel,
        });
      },

      // 追踪代码复制
      trackCodeCopy: function (codeType) {
        gtag("event", "code_copy", {
          code_type: codeType,
        });
      },

      // 追踪搜索
      trackSearch: function (searchTerm) {
        gtag("event", "search", {
          search_term: searchTerm,
        });
      },

      // 追踪文档下载
      trackDownload: function (fileName, fileType) {
        gtag("event", "file_download", {
          file_name: fileName,
          file_type: fileType,
        });
      },

      // 追踪外链点击
      trackExternalLink: function (url, linkText) {
        gtag("event", "external_link_click", {
          url: url,
          link_text: linkText,
        });
      },
    };
  }

  initOnRouteChange()
})();
