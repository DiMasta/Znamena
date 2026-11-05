// ---- Shared helpers ----

function flagUrl(country, width) {
  return "https://flagcdn.com/w" + width + "/" + country.code + ".png";
}

function setFlag(img, country, width) {
  img.src = flagUrl(country, width);
  img.alt = "Знаме на " + country.name;
  img.classList.toggle("no-border", country.code === "np");
}

// Fisher-Yates shuffle of an array, in place.
function shuffleArray(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// A random order visiting every country once. If avoidFirst is given,
// the new deck does not start with that country (no repeat across cycles).
function newDeck(avoidFirst) {
  var deck = shuffleArray(COUNTRIES.map(function (_, i) { return i; }));
  if (deck.length > 1 && deck[0] === avoidFirst) {
    deck[0] = deck[1];
    deck[1] = avoidFirst;
  }
  return deck;
}

function isValidDeck(deck, pos) {
  if (!Array.isArray(deck) || deck.length !== COUNTRIES.length) return false;
  for (var i = 0; i < deck.length; i++) {
    if (typeof deck[i] !== "number" || deck[i] < 0 || deck[i] >= COUNTRIES.length) return false;
  }
  return typeof pos === "number" && pos >= 0 && pos < deck.length;
}

function saveState(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) { /* storage unavailable */ }
}

function loadState(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {
    return null;
  }
}

// Buttons act on their own; stop the tap from also reaching the screen behind.
function bindButton(id, action) {
  document.getElementById(id).addEventListener("click", function (e) {
    e.stopPropagation();
    action();
  });
}

// ---- Classic: one flag at a time, shuffled, with saved progress ----

var classic = (function () {
  var STORAGE_KEY = "flagsGame.v1";
  var nameEl = document.getElementById("name");
  var flagEl = document.getElementById("flag");
  var counterEl = document.getElementById("counter");
  var deck = [];  // shuffled order of country indices for the current cycle
  var pos = 0;    // index in the deck of the flag currently on screen

  // Draw the flag at the current position and save progress.
  function render() {
    var country = COUNTRIES[deck[pos]];
    nameEl.textContent = country.name;
    nameEl.classList.toggle("long", country.name.length > 20);
    setFlag(flagEl, country, 640);
    counterEl.textContent = (pos + 1) + "/" + COUNTRIES.length;
    saveState(STORAGE_KEY, { deck: deck, pos: pos });
  }

  function next() {
    if (pos < deck.length - 1) {
      pos++;
    } else {
      // Whole world cycled through: reshuffle and start a new cycle.
      deck = newDeck(deck[pos]);
      pos = 0;
    }
    render();
  }

  function prev() {
    if (pos > 0) {
      pos--;
      render();
    }
  }

  function restart() {
    deck = newDeck(deck[pos]);
    pos = 0;
    render();
  }

  bindButton("prev", prev);
  bindButton("next", next);
  bindButton("restart", restart);
  // Tapping anywhere on the classic screen goes to the next flag.
  document.getElementById("classic").addEventListener("click", next);

  // Resume the previous session, or start a fresh shuffled cycle.
  var saved = loadState(STORAGE_KEY);
  if (saved && isValidDeck(saved.deck, saved.pos)) {
    deck = saved.deck;
    pos = saved.pos;
  } else {
    deck = newDeck(-1);
  }
  render();
})();

// ---- Master map: country location on its continent ----

var geo = (function () {
  // Map views: [west lon, south lat, east lon, north lat].
  var VIEWS = {
    europe: [-25, 34, 50, 71],
    africa: [-26, -36, 60, 38],
    asia: [33, -11, 150, 75],
    northamerica: [-170, 14, -52, 72],
    caribbean: [-92, 7, -58, 27],
    southamerica: [-82, -56, -34, 13],
    oceania: [110, -48, 212, 16]
  };
  // The continent each map view belongs to; countries elsewhere are faded.
  var VIEW_REGION = {
    europe: "europe",
    africa: "africa",
    asia: "asia",
    northamerica: "americas",
    caribbean: "americas",
    southamerica: "americas",
    oceania: "oceania"
  };
  // Map shapes whose continent can't be guessed from the nearest country.
  var REGION_OVERRIDES = { "304": "americas", "010": "" };  // Greenland, Antarctica

  var features = null;  // all map shapes, once loaded
  var byId = {};        // ISO numeric id -> shape
  var loading = null;

  function load() {
    if (!loading) {
      loading = fetch("vendor/countries-50m.json")
        .then(function (r) { return r.json(); })
        .then(function (topo) {
          // Shapes sharing a code (Australia and its Ashmore and Cartier
          // Islands) are merged into one, so the whole country is highlighted.
          features = [];
          topojson.feature(topo, topo.objects.countries).features.forEach(function (f) {
            var same = f.id && byId[f.id];
            if (same) {
              same.geometry = { type: "MultiPolygon", coordinates: polygons(same.geometry).concat(polygons(f.geometry)) };
              return;
            }
            if (f.id) byId[f.id] = f;
            features.push(f);
          });
          assignRegions();
        })
        .catch(function () { loading = null; });
    }
    return loading;
  }

  function polygons(geometry) {
    return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  }

  // Give every map shape a region and view. Territories that are not in the
  // country list (Taiwan, Kosovo, Puerto Rico...) take their nearest country's.
  function assignRegions() {
    var known = [];
    COUNTRIES.forEach(function (c) {
      var f = byId[c.id];
      if (!f) return;
      f.region = c.region;
      f.view = c.view;
      known.push({ f: f, at: d3.geoCentroid(f) });
    });
    features.forEach(function (f) {
      if (f.region !== undefined) return;
      if (REGION_OVERRIDES.hasOwnProperty(f.id)) {
        f.region = REGION_OVERRIDES[f.id];
        return;
      }
      var at = d3.geoCentroid(f);
      var best = null;
      var bestDist = Infinity;
      known.forEach(function (k) {
        var d = d3.geoDistance(at, k.at);
        if (d < bestDist) {
          bestDist = d;
          best = k.f;
        }
      });
      f.region = best.region;
      f.view = best.view;
    });
  }

  function ready() {
    return features !== null;
  }

  // Points along the edges of a view box, so the projection fits the whole box.
  function boxOutline(box) {
    var pts = [];
    for (var t = 0; t <= 1; t += 0.05) {
      var lon = box[0] + (box[2] - box[0]) * t;
      var lat = box[1] + (box[3] - box[1]) * t;
      pts.push([lon, box[1]], [lon, box[3]], [box[0], lat], [box[2], lat]);
    }
    return { type: "MultiPoint", coordinates: pts };
  }

  // SVG markup of the country's continent with the country highlighted, sized
  // W x H to fill its container. Countries too small to see get a circle.
  function svg(country, W, H) {
    var box = VIEWS[country.view];
    var projection = d3.geoAzimuthalEqualArea()
      .rotate([-(box[0] + box[2]) / 2, -(box[1] + box[3]) / 2])
      .clipAngle(90)
      .fitExtent([[8, 8], [W - 8, H - 8]], boxOutline(box));
    var path = d3.geoPath(projection);
    if (path.digits) path.digits(1);

    // Countries of the continent in grey; everything else faded into the background.
    var target = byId[country.id];
    var region = VIEW_REGION[country.view];
    var focus = "";
    var faded = "";
    features.forEach(function (f) {
      if (f === target) return;
      var d = path(f);
      if (!d) return;
      if (f.view === country.view || f.region === region) {
        focus += '<path d="' + d + '"/>';
      } else {
        faded += '<path d="' + d + '"/>';
      }
    });
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="m-ocean" width="' + W + '" height="' + H + '"/>' +
      '<g class="m-faded">' + faded + "</g>" +
      '<g class="m-land">' + focus + "</g>";

    // Countries too small to see (islands, micro-states) are drawn with a
    // bold outline and a soft glow, so each island shows where it really is.
    if (target) {
      var d = path(target);
      if (path.area(target) < 40) {
        out += '<path class="m-glow" d="' + d + '"/><path class="m-target m-small" d="' + d + '"/>';
      } else {
        out += '<path class="m-target" d="' + d + '"/>';
      }
    } else if (country.ll) {
      var p = projection(country.ll);
      var at = 'cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '"';
      out += '<circle class="m-glow" ' + at + ' r="12" style="stroke:none"/><circle class="m-target m-small" ' + at + ' r="1.5"/>';
    }
    return out + "</svg>";
  }

  return { load: load, ready: ready, svg: svg };
})();

// Draw a country's continent map into el at exactly el's size. Skipped when
// that country is already drawn at that size; waits for the map data if needed.
function drawCountryMap(el, country) {
  if (!el || !country) return;
  el.dataset.want = country.code;
  if (!geo.ready()) {
    geo.load().then(function () {
      // Only if the element still wants this country (not a later one).
      if (geo.ready() && el.dataset.want === country.code) drawCountryMap(el, country);
    });
    return;
  }
  var w = el.clientWidth;
  var h = el.clientHeight;
  if (!w || !h) return;
  var key = country.code + ":" + w + "x" + h;
  if (el.dataset.drawn === key) return;
  el.dataset.drawn = key;
  el.innerHTML = geo.svg(country, w, h);
}

// ---- Master: quiz, pick the right flag out of four ----

var master = (function () {
  var STORAGE_KEY = "flagsGame.master.v1";
  var screenEl = document.getElementById("master");
  var promptEl = document.getElementById("prompt");
  var optionsEl = document.getElementById("options");

  var HISTORY_MAX = 100;

  var deck = [];
  var pos = 0;
  var question = null;
  var history = [];   // questions shown so far, so "‹" can go back to them
  var hIndex = -1;    // position of the current question in history
  var shown = false;  // whether the current question has been drawn yet
  var advanceTimer = null;

  // Saved with country codes so the questions can be rebuilt on the next visit.
  function save() {
    saveState(STORAGE_KEY, {
      deck: deck,
      pos: pos,
      hIndex: hIndex,
      history: history.map(function (q) {
        return {
          t: q.target.code,
          k: q.kind,
          o: q.options.map(function (c) { return c.code; }),
          c: q.choice ? q.choice.code : null
        };
      })
    });
  }

  // Rebuild saved questions; anything that no longer makes sense is dropped.
  function restoreHistory(saved) {
    if (!Array.isArray(saved)) return [];
    var byCode = {};
    COUNTRIES.forEach(function (c) { byCode[c.code] = c; });
    var out = [];
    saved.forEach(function (s) {
      if (!s || !byCode[s.t] || ["name", "capital", "map"].indexOf(s.k) < 0) return;
      if (!Array.isArray(s.o) || s.o.length !== 4 || s.o.indexOf(s.t) < 0) return;
      if (!s.o.every(function (code) { return byCode[code]; })) return;
      out.push({
        target: byCode[s.t],
        kind: s.k,
        options: s.o.map(function (code) { return byCode[code]; }),
        choice: byCode[s.c] || null
      });
    });
    return out.slice(-HISTORY_MAX);
  }

  // The capital question is pointless when the capital shares the country's name.
  function capitalIsTrivial(country) {
    var n = country.name.toLowerCase();
    var c = country.capital.toLowerCase();
    return n.indexOf(c) === 0 || c.indexOf(n) === 0;
  }

  // Three wrong answers: flags that look like the right one, chosen at random
  // among its five closest look-alikes so the same three don't always appear.
  // The fallbacks (same part of the world, then anywhere) only fill gaps.
  function pickWrong(target) {
    var used = {};
    used[target.code] = true;
    var picks = [];
    var lookAlikes = shuffleArray(COUNTRIES.filter(function (c) {
      return (target.similar || []).slice(0, 5).indexOf(c.code) >= 0;
    }));
    for (var s = 0; s < lookAlikes.length && picks.length < 3; s++) {
      used[lookAlikes[s].code] = true;
      picks.push(lookAlikes[s]);
    }
    var groups = [
      function (c) { return c.view === target.view; },
      function (c) { return c.region === target.region; },
      function () { return true; }
    ];
    for (var g = 0; g < groups.length && picks.length < 3; g++) {
      var pool = shuffleArray(COUNTRIES.filter(function (c) { return !used[c.code] && groups[g](c); }));
      for (var i = 0; i < pool.length && picks.length < 3; i++) {
        used[pool[i].code] = true;
        picks.push(pool[i]);
      }
    }
    return picks;
  }

  function makeQuestion() {
    var target = COUNTRIES[deck[pos]];
    var kinds = ["name"];
    if (!capitalIsTrivial(target)) kinds.push("capital");
    if (geo.ready()) kinds.push("map");
    return {
      target: target,
      kind: kinds[Math.floor(Math.random() * kinds.length)],
      options: shuffleArray([target].concat(pickWrong(target))),
      choice: null   // the flag picked, once answered
    };
  }

  function drawMap() {
    if (question && question.kind === "map") drawCountryMap(document.getElementById("map"), question.target);
  }

  function renderPrompt() {
    var t = question.target;
    if (question.kind === "map") {
      promptEl.innerHTML = '<div id="map" class="map"></div>';
      drawMap();
      return;
    }
    // Only capitals get a subtitle, so they are not mistaken for country names.
    var isCapital = question.kind === "capital";
    promptEl.innerHTML = (isCapital ? '<div class="tag">Столица</div>' : "") +
      '<div class="q-text' + (isCapital ? " capital" : "") + '"></div>';
    promptEl.querySelector(".q-text").textContent = isCapital ? t.capital : t.name;
  }

  function renderOptions() {
    optionsEl.innerHTML = "";
    optionsEl.classList.remove("answered");
    question.options.forEach(function (country) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.innerHTML = '<div class="flag-box"><img alt=""></div><div class="opt-label"></div>';
      setFlag(btn.querySelector("img"), country, 320);
      btn.querySelector(".opt-label").textContent = country.name;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        // Once answered, a tap on a flag moves on like a tap anywhere else.
        if (question.choice) next();
        else answer(country);
      });
      optionsEl.appendChild(btn);
    });
  }

  // Show the current question and save, so a later visit reopens it.
  function render() {
    // Answers first: the map measures the space the answers leave over.
    renderOptions();
    renderPrompt();
    if (question.choice) showResult();
    shown = true;
    save();
  }

  // Reveal all names; green for the right flag, red for a wrong pick.
  function showResult() {
    optionsEl.classList.add("answered");
    var buttons = optionsEl.querySelectorAll(".option");
    question.options.forEach(function (c, i) {
      if (c === question.target) buttons[i].classList.add("correct");
      else if (c === question.choice) buttons[i].classList.add("wrong");
    });
  }

  function answer(country) {
    if (question.choice) return;
    question.choice = country;
    showResult();
    save();
    if (country === question.target) advanceTimer = setTimeout(next, 1200);
  }

  // Start a brand new question for the next country in the deck.
  function addQuestion() {
    question = makeQuestion();
    history.push(question);
    if (history.length > HISTORY_MAX) history.shift();
    hIndex = history.length - 1;
  }

  function next() {
    clearTimeout(advanceTimer);
    if (hIndex < history.length - 1) {
      // Came back with "‹": step forward through questions already seen.
      question = history[++hIndex];
    } else {
      if (pos < deck.length - 1) {
        pos++;
      } else {
        deck = newDeck(deck[pos]);
        pos = 0;
      }
      addQuestion();
    }
    render();
  }

  function prev() {
    if (hIndex <= 0) return;
    clearTimeout(advanceTimer);
    question = history[--hIndex];
    render();
  }

  function restart() {
    clearTimeout(advanceTimer);
    deck = newDeck(deck[pos]);
    pos = 0;
    history = [];
    addQuestion();
    render();
  }

  // Called every time the Master screen is opened.
  function enter() {
    geo.load();
    if (!question) addQuestion();
    if (!shown) render();
  }

  bindButton("m-prev", prev);
  bindButton("m-next", next);
  bindButton("m-restart", restart);
  // After a wrong answer, tapping anywhere moves on to the next question.
  screenEl.addEventListener("click", function () {
    if (question && question.choice) next();
  });

  // Redraw the map whenever its space changes size (e.g. the phone is rotated).
  if (window.ResizeObserver) {
    new ResizeObserver(drawMap).observe(promptEl);
  } else {
    window.addEventListener("resize", drawMap);
  }

  // Resume where the last visit stopped, including the question on screen.
  var saved = loadState(STORAGE_KEY);
  if (saved && isValidDeck(saved.deck, saved.pos)) {
    deck = saved.deck;
    pos = saved.pos;
    history = restoreHistory(saved.history);
    if (history.length) {
      hIndex = Math.min(Math.max(saved.hIndex | 0, 0), history.length - 1);
      question = history[hIndex];
    }
  } else {
    deck = newDeck(-1);
  }

  return { enter: enter };
})();

// ---- Screen routing ----

// ---- Learn: pick a list, then swipe through one card per country ----

var learn = (function () {
  var STORAGE_KEY = "flagsGame.learn.v2";
  var LISTS = ["europe", "asia", "africa", "northamerica", "southamerica", "oceania", "all", "area"];
  var scrollEl = document.getElementById("cards-scroll");
  var posEl = document.getElementById("cards-pos");

  // The open list, and the card reached in every list (kept separately).
  var state = { list: null, pos: {} };
  var list = [];      // countries of the open list, in order
  var cards = [];     // their card elements
  var builtFor = null;
  var current = 0;

  function continentOf(c) {
    if (c.view === "northamerica" || c.view === "caribbean") return "northamerica";
    if (c.view === "southamerica") return "southamerica";
    return c.region;
  }

  // A continent alphabetically, all countries alphabetically, or all by area.
  function countriesFor(key) {
    var everyone = key === "all" || key === "area";
    var out = COUNTRIES.filter(function (c) { return everyone || continentOf(c) === key; });
    if (key === "area") {
      out.sort(function (a, b) { return b.area - a.area; });
    } else {
      out.sort(function (a, b) { return a.name.localeCompare(b.name, "bg"); });
    }
    return out;
  }

  function formatArea(km2) {
    return km2.toLocaleString("bg-BG", { maximumFractionDigits: km2 < 10 ? 2 : 0 }) + " км²";
  }

  function makeCard(c) {
    var el = document.createElement("div");
    el.className = "lcard";
    el.innerHTML =
      '<div class="lc-info">' +
        '<div class="lc-name"></div>' +
        '<div class="flag-box lc-flag"><img alt=""></div>' +
        '<div class="tag">Столица</div>' +
        '<div class="q-text capital lc-capital"></div>' +
        '<div class="lc-area"></div>' +
      '</div>' +
      '<div class="lc-side"><div class="map lc-map"></div><div class="lc-fact"></div></div>';
    el.querySelector(".lc-name").textContent = c.name;
    el.querySelector(".lc-capital").textContent = c.capital;
    el.querySelector(".lc-area").textContent = "Площ: " + formatArea(c.area);
    el.querySelector(".lc-fact").textContent = FACTS[c.code] || "";
    return el;
  }

  // Flags and maps are loaded only for cards near the screen; maps of cards
  // that scroll far away are dropped again to keep the page light.
  var nearby = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var i = cards.indexOf(entry.target);
      if (i < 0) return;
      var mapEl = entry.target.querySelector(".lc-map");
      if (entry.isIntersecting) {
        var img = entry.target.querySelector("img");
        if (!img.getAttribute("src")) setFlag(img, list[i], 640);
        drawCountryMap(mapEl, list[i]);
      } else {
        mapEl.innerHTML = "";
        delete mapEl.dataset.drawn;
      }
    });
  }, { root: scrollEl, rootMargin: "100% 0px" });

  function build() {
    nearby.disconnect();
    scrollEl.innerHTML = "";
    list = countriesFor(state.list);
    cards = list.map(makeCard);
    cards.forEach(function (el) {
      scrollEl.appendChild(el);
      nearby.observe(el);
    });
    builtFor = state.list;
  }

  function save() {
    saveState(STORAGE_KEY, state);
  }

  function showPos() {
    posEl.textContent = (current + 1) + "/" + list.length;
  }

  // Put the given card on screen without animation.
  function jumpTo(i) {
    current = Math.max(0, Math.min(i, cards.length - 1));
    scrollEl.scrollTop = current * scrollEl.clientHeight;
    showPos();
  }

  // Follow the swipes: the card filling the screen is the current one.
  scrollEl.addEventListener("scroll", function () {
    var h = scrollEl.clientHeight;
    if (!h || !cards.length) return;
    var i = Math.max(0, Math.min(Math.round(scrollEl.scrollTop / h), cards.length - 1));
    if (i === current) return;
    current = i;
    state.pos[state.list] = i;
    showPos();
    save();
  });

  // Keep the same card in place when the phone is rotated.
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (!cards.length || !scrollEl.clientHeight) return;
      jumpTo(current);
      for (var i = current - 1; i <= current + 1; i++) {
        if (cards[i]) drawCountryMap(cards[i].querySelector(".lc-map"), list[i]);
      }
    }).observe(scrollEl);
  }

  // Back to the first card of the open list; other lists keep their place.
  bindButton("cards-reset", function () {
    state.pos[state.list] = 0;
    jumpTo(0);
    save();
  });

  // Buttons on the Learn page open their list of cards.
  var listButtons = document.querySelectorAll("[data-list]");
  for (var b = 0; b < listButtons.length; b++) {
    listButtons[b].addEventListener("click", function () {
      state.list = this.getAttribute("data-list");
      save();
      showScreen("cards");
    });
  }

  // Called when the cards screen is shown. Returns false if no list is chosen.
  function enterCards() {
    if (LISTS.indexOf(state.list) < 0) return false;
    geo.load();
    if (builtFor !== state.list) build();
    jumpTo(state.pos[state.list] || 0);
    return true;
  }

  var saved = loadState(STORAGE_KEY);
  if (saved && saved.pos && typeof saved.pos === "object") {
    state.pos = saved.pos;
    if (LISTS.indexOf(saved.list) >= 0) state.list = saved.list;
  }

  return { enterCards: enterCards };
})();

var screens = {
  menu: document.getElementById("menu"),
  classic: document.getElementById("classic"),
  master: document.getElementById("master"),
  learn: document.getElementById("learn"),
  cards: document.getElementById("cards")
};

var SCREEN_KEY = "flagsGame.screen";

// Show one screen and remember it, so the site reopens on the same one.
function showScreen(name) {
  for (var key in screens) {
    screens[key].classList.toggle("hidden", key !== name);
  }
  if (name === "master") master.enter();
  // Without a chosen list there are no cards to show: go to the Learn page.
  if (name === "cards" && !learn.enterCards()) return showScreen("learn");
  saveState(SCREEN_KEY, name);
}

// Any element with data-go navigates to that screen (menu entries + home buttons).
var navButtons = document.querySelectorAll("[data-go]");
for (var n = 0; n < navButtons.length; n++) {
  navButtons[n].addEventListener("click", function (e) {
    e.stopPropagation();
    showScreen(this.getAttribute("data-go"));
  });
}

// Taps on a control bar background should not reach the screen behind it.
var bars = document.querySelectorAll(".controls");
for (var b = 0; b < bars.length; b++) {
  bars[b].addEventListener("click", function (e) {
    e.stopPropagation();
  });
}

// ---- Press feedback: keep the pressed look long enough to be seen ----

var PRESS_MS = 140;
document.addEventListener("pointerdown", function (e) {
  var btn = e.target.closest("button");
  if (btn) {
    btn.classList.add("pressed");
    btn.pressedAt = Date.now();
  }
});

function releasePressed() {
  var pressed = document.querySelectorAll("button.pressed");
  for (var i = 0; i < pressed.length; i++) {
    (function (btn) {
      var wait = Math.max(0, PRESS_MS - (Date.now() - (btn.pressedAt || 0)));
      setTimeout(function () { btn.classList.remove("pressed"); }, wait);
    })(pressed[i]);
  }
}
document.addEventListener("pointerup", releasePressed);
document.addEventListener("pointercancel", releasePressed);

var lastScreen = loadState(SCREEN_KEY);
showScreen(screens.hasOwnProperty(lastScreen) ? lastScreen : "menu");
