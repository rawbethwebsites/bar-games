// Blinking TBN favicon — alternates between two color versions for a blinking effect
(function() {
  const favicon1 = '/favicon-1.png';
  const favicon2 = '/favicon-2.png';
  let toggle = false;

  function setFavicon(href) {
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }

  setInterval(function() {
    toggle = !toggle;
    setFavicon(toggle ? favicon2 : favicon1);
  }, 800);
})();