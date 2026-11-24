/* "Caller" – a TV-közvetítésekből ismert bemondó, a böngésző beszédszintézisével. */
(function (D) {
  'use strict';
  const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function en(n) {
    if (n === 0) return 'no score';
    if (n < 20) return EN_ONES[n];
    if (n < 100) return EN_TENS[Math.floor(n / 10)] + (n % 10 ? '-' + EN_ONES[n % 10] : '');
    const h = Math.floor(n / 100), r = n % 100;
    return EN_ONES[h] + ' hundred' + (r ? ' and ' + en(r) : '');
  }

  function hu(n) { return n === 0 ? 'nulla' : String(n); }

  const Caller = {
    cfg: { enabled: false, lang: 'en' },
    say(text) {
      if (!this.cfg.enabled || !globalThis.speechSynthesis) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = this.cfg.lang === 'hu' ? 'hu-HU' : 'en-GB';
        u.rate = 0.95; u.pitch = 0.9;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch (e) { /* nincs hang */ }
    },
    visit(total, bust) {
      if (this.cfg.lang === 'hu') return this.say(bust ? 'Besokallt' : total === 180 ? 'Száznyolcvan!' : hu(total));
      this.say(bust ? 'No score' : total === 180 ? 'One hundred and eightyyy!' : en(total));
    },
    require(name, rem) {
      if (this.cfg.lang === 'hu') return this.say(name + ', ' + rem + ' kell');
      this.say(name + ', you require ' + en(rem));
    },
    gameShot(name, what) {
      if (this.cfg.lang === 'hu') return this.say('Game shot! ' + (what === 'match' ? 'A meccset ' : 'A leget ') + name + ' nyerte');
      this.say('Game shot, and the ' + (what === 'match' ? 'match' : what === 'set' ? 'set' : 'leg') + ', ' + name + '!');
    },
    en
  };
  D.caller = Caller;
})(globalThis.D = globalThis.D || {});
