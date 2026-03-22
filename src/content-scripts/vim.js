console.log("[browser-vim-navigator]: `vim.js` LOADED");
console.log(
  "[browser-vim-navigator]: for verbose logging, run `window.BROWSER_VIM_NAVIGATOR_DEBUG_MODE = true`",
);

function debug(...msg) {
  if (window.BROWSER_VIM_NAVIGATOR_DEBUG_MODE) {
    console.debug("[browser-vim-navigator]:", ...msg);
  }
}

const MODES = {
  NORMAL: "normal",
  INSERT: "insert",
  HINTS: "hints",
  INPUT_SELECTOR: "input-selector",
};

const MODE_CHANGE_EVENT = "vim:mode-change";

// Add style once
const style = document.createElement("style");
style.textContent = `
  .browser-vim-navigator-hint {
    position: fixed;
    background: rgba(31, 36, 38, 0.7);
    color: #00fffb;
    font-size: 16px;
    font-weight: bold;
    padding: 2px 4px;
    z-index: 999999;
    font-family: "NxtFont", "monospace";
  }

  .browser-vim-navigator-input {
    background-color: rgba(119, 150, 119, 0.2) !important;
  }

  .browser-vim-navigator-input-active {
    background-color: rgba(194, 168, 120, 0.2) !important;
  }
`;
document.head.appendChild(style);

function normalModeHandler({ mode }) {
  return (e) => {
    e.stopPropagation();

    debug("EVENT LISTENER STARTED");

    // Ignore if user is typing in input/textarea/contenteditable
    const active = document.activeElement;
    const isTyping =
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable;

    if (isTyping) return;

    debug(`[${mode}]: key => `, e.key);

    const key = e.key;

    switch (mode) {
      case MODES.NORMAL:
        if (key in normalModeMotions) {
          normalModeMotions[key]();
        }
        break;
    }

    debug("EVENT LISTENER FINISHED");
  };
}

function hintModeHandler({ overlays, openInNewTab }) {
  let userInput = "";

  return (e) => {
    if (e.repeat) return;
    e.stopPropagation();

    if (e.key === "Escape") {
      e.preventDefault();
      userInput = "";

      debug("MODE CHANGED: HINTS => NORMAL");
      dispatchModeChange(MODES.NORMAL);
    }

    userInput += e.key;

    const matches = overlays.filter((item) => item.label.startsWith(userInput));
    const matchSet = new Set(matches);

    // hide non-matching
    overlays.forEach((item) => {
      item.hintEl.style.display = matchSet.has(item) ? "block" : "none";
    });

    if (matches.length === 0) {
      userInput = "";
      dispatchModeChange(MODES.NORMAL);
    }

    if (matches.length === 1 && matches[0].label === userInput) {
      userInput = "";
      const el = matches[0].target;

      if (openInNewTab && el instanceof HTMLAnchorElement) {
        el.target = "_blank";
        el.rel = "noopener noreferrer";
      }

      el.click();
      matches[0].hintEl.style.display = "none";
      dispatchModeChange(MODES.NORMAL);
    }
  };
}

function inputSelectorHandler({ elements }) {
  let activeIndex = 0;

  return (e) => {
    if (e.repeat) return;
    e.stopPropagation();

    if (elements.length > 0) {
      debug("ACTIVE ELEMENT: len = ", elements.length);
      elements[activeIndex].classList.add("browser-vim-navigator-input-active");
    }

    debug("[FOCUSING] ACTIVE ELEMENT: ", elements[activeIndex]);
    elements[activeIndex].focus();

    switch (e.key) {
      case "Escape": {
        debug("MODE CHANGED: INPUT_SELECTOR => NORMAL");
        elements[activeIndex].classList.remove(
          "browser-vim-navigator-input-active",
        );
        dispatchModeChange(MODES.NORMAL);
        break;
      }
      case "Tab": {
        e.preventDefault();

        elements[activeIndex].classList.remove(
          "browser-vim-navigator-input-active",
        );

        activeIndex += 1;
        if (activeIndex >= elements.length) {
          activeIndex = 0;
        }

        elements[activeIndex].classList.add(
          "browser-vim-navigator-input-active",
        );
        elements[activeIndex].focus();
      }
    }
  };
}

let currentHandler = null;
let handlerCleanup = [];

document.addEventListener(MODE_CHANGE_EVENT, (e) => {
  const mode = e.detail.mode;

  document.removeEventListener("keydown", currentHandler);
  handlerCleanup.forEach((fn) => {
    fn();
  });
  handlerCleanup = [];

  switch (mode) {
    case MODES.NORMAL:
      currentHandler = normalModeHandler({ mode });
      break;

    case MODES.HINTS: {
      const overlays = showHints(e.detail.elements);
      currentHandler = hintModeHandler({ mode, overlays });

      handlerCleanup.push(() => {
        overlays.forEach(({ hintEl }) => {
          hintEl.remove();
        });
      });

      break;
    }

    case MODES.INPUT_SELECTOR: {
      const elements = e.detail.elements;

      elements.forEach((el) => {
        el.classList.add("browser-vim-navigator-input");
      });

      handlerCleanup.push(() => {
        debug("HANDLER CLEANUP INPUT_SELECTOR");
        elements.forEach((el) => {
          el.classList.remove("browser-vim-navigator-input");
          el.classList.remove("browser-vim-navigator-input-active");
        });
      });

      currentHandler = inputSelectorHandler({
        mode,
        elements: e.detail.elements,
      });

      break;
    }
  }

  document.addEventListener("keydown", currentHandler, true);
});

function dispatchModeChange(mode, data) {
  debug(`MODE CHANGED to ${mode}`);

  document.dispatchEvent(
    new CustomEvent(MODE_CHANGE_EVENT, {
      detail: {
        ...data,
        mode: mode,
      },
    }),
  );
}

dispatchModeChange(MODES.NORMAL);

const KEY_REPEAT_TIMEOUT = 400;

function createKeyBuffer() {
  let keychords = [];

  function cleanup() {
    const now = Date.now();
    keychords = keychords.filter((kc) => now - kc.time < KEY_REPEAT_TIMEOUT);
  }

  return new Proxy(
    {},
    {
      get(_, prop) {
        cleanup();

        switch (prop) {
          case "push": {
            return (key) => {
              keychords.push({ key, time: Date.now() });
            };
          }

          case "clear": {
            return () => {
              keychords = [];
            };
          }

          case "value": {
            return keychords.map((k) => k.key).join("");
          }

          case "isEmpty": {
            return keychords.length === 0;
          }
        }
      },
    },
  );
}

const keyBuffer = createKeyBuffer();

const normalModeMotions = {
  escape: () => {
    keyBuffer.isEmpty && dispatchModeChange(MODES.NORMAL);
  },
  i: () => {
    if (keyBuffer.isEmpty) {
      dispatchModeChange(MODES.INSERT);
      return;
    }

    keyBuffer.push("i");
    switch (keyBuffer.value) {
      case "gi":
        activateInputHighlightMode();
        break;
    }
  },
  j: () => {
    window.scrollBy(0, 80);
  },
  k: () => {
    window.scrollBy(0, -80);
  },
  h: () => {
    window.scrollBy(-80, 0);
  },
  l: () => {
    window.scrollBy(80, 0);
  },
  g: () => {
    debug("key buffer: ", keyBuffer.value);
    if (keyBuffer.isEmpty) {
      keyBuffer.push("g");
      return;
    }

    keyBuffer.push("g");
    debug("key buffer: ", keyBuffer.value);
    switch (keyBuffer.value) {
      case "gg":
        window.scrollTo(0, 0); // top of page
        break;
    }

    keyBuffer.clear();
  },
  G: () => {
    window.scrollTo(0, document.body.scrollHeight);
  },
  H: () => {
    window.history.back();
  },
  L: () => {
    window.history.forward();
  },

  f: () => {
    // INFO: find links, and highlight them
    activateHintMode();
  },

  F: () => {
    // INFO: find links, and highlight them
    activateHintMode();
  },
};

function getClickableElements() {
  const elements = [
    ...document.querySelectorAll("a, button, input, [onclick]"),
  ];

  return elements.filter((el) => {
    const rect = el.getBoundingClientRect();

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  });
}

function getInputElements() {
  const elements = [...document.querySelectorAll("input[type=text], textarea")];

  return elements;
}

const CHARS = "asdfghjkl";

function generateHints(count) {
  const hints = [];
  const queue = [...CHARS];

  while (hints.length < count) {
    const current = queue.shift();
    hints.push(current);

    for (const c of CHARS) {
      queue.push(current + c);
    }
  }

  return hints;
}

function showHints(elements) {
  const hints = generateHints(elements.length);

  const overlays = [];

  elements.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const hint = document.createElement("div");
    hint.textContent = hints[i];
    hint.classList.add("browser-vim-navigator-hint");
    hint.style.top = `${rect.top - 5}px`;
    hint.style.left = `${rect.left}px`;

    document.body.appendChild(hint);

    overlays.push({ hintEl: hint, target: el, label: hints[i] });
  });

  return overlays;
}

function activateHintMode(openInNewTab = false) {
  const elements = getClickableElements();

  dispatchModeChange(MODES.HINTS, { elements, openInNewTab });
}

function activateInputHighlightMode() {
  const elements = getInputElements();
  dispatchModeChange(MODES.INPUT_SELECTOR, { elements });
}
