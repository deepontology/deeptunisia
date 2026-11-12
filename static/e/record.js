/* Set language, direction and theme from the reader's saved choice. Same keys as
   the app: deeptunisia:locale, deeptunisia:theme. Without it the page is English,
   follows the device theme, and is complete. */
(function () {
	try {
		var l = localStorage.getItem('deeptunisia:locale');
		if (l !== 'ar' && l !== 'fr' && l !== 'en') {
			var n = (navigator.language || '').toLowerCase();
			l = n.indexOf('ar') === 0 ? 'ar' : n.indexOf('fr') === 0 ? 'fr' : 'en';
		}
		var h = document.documentElement;
		h.setAttribute('lang', l);
		h.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
	} catch (e) {}
	try {
		var m = { paper: 'light', porcelain: 'light', daylight: 'light', midnight: 'dark', ember: 'dark', eclipse: 'dark' };
		var t = localStorage.getItem('deeptunisia:theme');
		if (m[t]) {
			document.documentElement.dataset.theme = m[t];
			document.documentElement.dataset.palette = t;
		}
	} catch (e) {}
})();
