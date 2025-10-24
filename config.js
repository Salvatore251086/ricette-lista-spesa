/* config.js
   Visibile sia a window che a Service Worker (self) */
(function (g) {
  g.APP_VERSION = '2025-10-23-2359'; // <— bump ad ogni release!
})(typeof self !== 'undefined' ? self : window);
