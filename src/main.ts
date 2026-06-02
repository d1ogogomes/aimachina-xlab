// Patch Element.prototype.scrollIntoView globally to prevent horizontal scroll shifts
if (typeof Element !== "undefined" && Element.prototype.scrollIntoView) {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (options?: any) {
    // 1. Capture scrollLeft of all ancestors
    const scrollPositions: { element: HTMLElement; scrollLeft: number }[] = [];
    let parent = this.parentElement;
    while (parent) {
      scrollPositions.push({
        element: parent,
        scrollLeft: parent.scrollLeft
      });
      parent = parent.parentElement;
    }
    
    // Capture document, body, and window scrolls
    const docScrollLeft = document.documentElement ? document.documentElement.scrollLeft : 0;
    const bodyScrollLeft = document.body ? document.body.scrollLeft : 0;
    const winScrollX = typeof window !== "undefined" ? window.scrollX : 0;

    // 2. Call original scrollIntoView
    originalScrollIntoView.call(this, options);

    // 3. Immediately restore horizontal scrolls to prevent side-shifting
    for (const pos of scrollPositions) {
      if (pos.element.scrollLeft !== pos.scrollLeft) {
        pos.element.scrollLeft = pos.scrollLeft;
      }
    }
    if (document.documentElement && document.documentElement.scrollLeft !== docScrollLeft) {
      document.documentElement.scrollLeft = docScrollLeft;
    }
    if (document.body && document.body.scrollLeft !== bodyScrollLeft) {
      document.body.scrollLeft = bodyScrollLeft;
    }
    if (typeof window !== "undefined" && window.scrollX !== winScrollX) {
      window.scrollTo(winScrollX, window.scrollY);
    }
  };
}

// Patch HTMLElement.prototype.focus globally to prevent browser from auto-scrolling when elements are focused
if (typeof HTMLElement !== "undefined" && HTMLElement.prototype.focus) {
  const originalFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (options?: any) {
    const newOptions = options || {};
    if (newOptions.preventScroll === undefined) {
      newOptions.preventScroll = true;
    }
    originalFocus.call(this, newOptions);
  };
}

// Global capturing scroll listener to block horizontal shifts on all non-scrollable layouts
if (typeof window !== "undefined") {
  window.addEventListener("scroll", (event) => {
    const target = event.target;
    if (target === window || target === document || target === document.documentElement || target === document.body) {
      if (window.scrollX !== 0) {
        window.scrollTo(0, window.scrollY);
      }
      if (document.documentElement && document.documentElement.scrollLeft !== 0) {
        document.documentElement.scrollLeft = 0;
      }
      if (document.body && document.body.scrollLeft !== 0) {
        document.body.scrollLeft = 0;
      }
    } else if (target instanceof Element) {
      const isAllowed = target.classList.contains("overflow-x-auto") || 
                        target.classList.contains("overflow-x-scroll") ||
                        target.hasAttribute("data-allow-hscroll") ||
                        (typeof target.closest === "function" && target.closest("[data-allow-hscroll]"));
      if (!isAllowed && target.scrollLeft !== 0) {
        target.scrollLeft = 0;
      }
    }
  }, true); // useCapture: true is required to capture scroll events on any child element
}

import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
