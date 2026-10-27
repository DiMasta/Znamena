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
    asia: [25, -11, 150, 75],
    northamerica: [-170, 14, -52, 72],
    caribbean: [-92, 7, -58, 27],
    southamerica: [-82, -56, -34, 13],
    oceania: [110, -48, 212, 16]
  };
  var features = null;  // all map shapes, once loaded
  var byId = {};        // ISO numeric id -> shape
  var loading = null;

  function load() {
    if (!loading) {
      loading = fetch("vendor/countries-50m.json")
        .then(function (r) { return r.json(); })
        .then(function (topo) {
          features = topojson.feature(topo, topo.objects.countries).features;
          features.forEach(function (f) { byId[f.id] = f; });
        })
        .catch(function () { loading = null; });
    }
    return loading;
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

    var target = byId[country.id];
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="' + W + '" height="' + H + '" fill="#e8f1f8"/>' +
      '<g fill="#d9d9d9" stroke="#ffffff" stroke-width="0.6">';
    features.forEach(function (f) {
      if (f === target) return;
      var d = path(f);
      if (d) out += '<path d="' + d + '"/>';
    });
    out += "</g>";

    var markers = [];
    if (target) {
      out += '<path d="' + path(target) + '" fill="#e53935" stroke="#ffffff" stroke-width="0.6"/>';
      if (path.area(target) < 40) markers = islandGroups(target, path);
    } else if (country.ll) {
      var p = projection(country.ll);
      markers = [{ x: p[0], y: p[1], r: 9 }];
    }
    markers.forEach(function (m) {
      out += '<circle cx="' + m.x.toFixed(1) + '" cy="' + m.y.toFixed(1) + '" r="' + m.r.toFixed(1) +
        '" fill="rgba(229,57,53,0.15)" stroke="#e53935" stroke-width="2.5"/>' +
        '<circle cx="' + m.x.toFixed(1) + '" cy="' + m.y.toFixed(1) + '" r="2.5" fill="#e53935"/>';
    });
    return out + "</svg>";
  }

  // One circle per group of nearby islands, so a country spread over the
  // ocean (like Kiribati) is marked where its islands actually are.
  function islandGroups(feature, path) {
    var GAP = 12;  // islands closer than this (in pixels) share a circle
    var g = feature.geometry;
    var parts = g.type === "MultiPolygon" ?
      g.coordinates.map(function (c) { return { type: "Polygon", coordinates: c }; }) : [g];
    var groups = [];
    parts.forEach(function (part) {
      var b = path.bounds(part);
      if (!isFinite(b[0][0])) return;  // outside the visible hemisphere
      groups.push([b[0][0], b[0][1], b[1][0], b[1][1]]);
    });
    // Merge overlapping or nearby boxes until nothing changes.
    var merged = true;
    while (merged) {
      merged = false;
      for (var i = 0; i < groups.length && !merged; i++) {
        for (var j = i + 1; j < groups.length; j++) {
          var a = groups[i];
          var c = groups[j];
          if (a[0] - GAP <= c[2] && c[0] - GAP <= a[2] && a[1] - GAP <= c[3] && c[1] - GAP <= a[3]) {
            groups[i] = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])];
            groups.splice(j, 1);
            merged = true;
            break;
          }
        }
      }
    }
    return groups.map(function (b) {
      var halfDiag = Math.sqrt(Math.pow(b[2] - b[0], 2) + Math.pow(b[3] - b[1], 2)) / 2;
      return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, r: Math.min(45, Math.max(9, halfDiag + 7)) };
    });
  }

  return { load: load, ready: ready, svg: svg };
})();

// ---- Master: quiz, pick the right flag out of four ----

var master = (function () {
  var STORAGE_KEY = "flagsGame.master.v1";
  var screenEl = document.getElementById("master");
  var promptEl = document.getElementById("prompt");
  var optionsEl = document.getElementById("options");

  var deck = [];
  var pos = 0;
  var question = null;
  var advanceTimer = null;

  function save() {
    saveState(STORAGE_KEY, { deck: deck, pos: pos });
  }

  // The capital question is pointless when the capital shares the country's name.
  function capitalIsTrivial(country) {
    var n = country.name.toLowerCase();
    var c = country.capital.toLowerCase();
    return n.indexOf(c) === 0 || c.indexOf(n) === 0;
  }

  // Three wrong answers, preferably from the same part of the world.
  function pickWrong(target) {
    var used = {};
    used[target.code] = true;
    var picks = [];
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
      done: false
    };
  }

  // Draw the map at exactly the size of its box; skipped when nothing changed.
  function drawMap() {
    var mapEl = document.getElementById("map");
    if (!mapEl || !question || question.kind !== "map") return;
    var w = mapEl.clientWidth;
    var h = mapEl.clientHeight;
    if (!w || !h) return;
    var size = w + "x" + h;
    if (mapEl.dataset.size === size) return;
    mapEl.dataset.size = size;
    mapEl.innerHTML = geo.svg(question.target, w, h);
  }

  function renderPrompt() {
    var t = question.target;
    if (question.kind === "map") {
      promptEl.innerHTML = '<div id="map"></div>';
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
        answer(country, btn);
      });
      optionsEl.appendChild(btn);
    });
  }

  function render() {
    // Answers first: the map measures the space the answers leave over.
    renderOptions();
    renderPrompt();
  }

  function answer(country, btn) {
    if (question.done) return;
    question.done = true;
    var right = country === question.target;

    // Reveal all names; green for the right flag, red for a wrong pick.
    optionsEl.classList.add("answered");
    var buttons = optionsEl.querySelectorAll(".option");
    question.options.forEach(function (c, i) {
      if (c === question.target) buttons[i].classList.add("correct");
    });
    if (right) {
      advanceTimer = setTimeout(next, 1200);
    } else {
      btn.classList.add("wrong");
    }
  }

  function next() {
    clearTimeout(advanceTimer);
    if (pos < deck.length - 1) {
      pos++;
    } else {
      deck = newDeck(deck[pos]);
      pos = 0;
    }
    save();
    question = makeQuestion();
    render();
  }

  function restart() {
    clearTimeout(advanceTimer);
    deck = newDeck(deck[pos]);
    pos = 0;
    save();
    question = makeQuestion();
    render();
  }

  // Called every time the Master screen is opened.
  function enter() {
    geo.load();
    if (!question) {
      question = makeQuestion();
      render();
    }
  }

  bindButton("m-next", next);
  bindButton("m-restart", restart);
  // After a wrong answer, tapping anywhere moves on to the next question.
  screenEl.addEventListener("click", function () {
    if (question && question.done) next();
  });

  // Redraw the map whenever its space changes size (e.g. the phone is rotated).
  if (window.ResizeObserver) {
    new ResizeObserver(drawMap).observe(promptEl);
  } else {
    window.addEventListener("resize", drawMap);
  }

  var saved = loadState(STORAGE_KEY);
  if (saved && isValidDeck(saved.deck, saved.pos)) {
    deck = saved.deck;
    pos = saved.pos;
  } else {
    deck = newDeck(-1);
  }

  return { enter: enter };
})();

// ---- Screen routing ----

var screens = {
  menu: document.getElementById("menu"),
  classic: document.getElementById("classic"),
  master: document.getElementById("master")
};

function showScreen(name) {
  for (var key in screens) {
    screens[key].classList.toggle("hidden", key !== name);
  }
  if (name === "master") master.enter();
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

showScreen("menu");
