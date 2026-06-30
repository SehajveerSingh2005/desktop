/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getState, setState, triggerSaveImmediate } from "./state.mjs";

const boardTitleInput = document.getElementById("board-title");

function adjustWidth() {
  if (!boardTitleInput) {
    return;
  }
  let span = document.getElementById("title-width-tester");
  if (!span) {
    span = document.createElement("span");
    span.id = "title-width-tester";
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.whiteSpace = "pre";
    document.body.appendChild(span);
  }
  const styles = window.getComputedStyle(boardTitleInput);
  span.style.fontFamily = styles.fontFamily;
  span.style.fontSize = styles.fontSize;
  span.style.fontWeight = styles.fontWeight;
  span.textContent = boardTitleInput.value || boardTitleInput.placeholder || "";
  const textWidth = span.getBoundingClientRect().width;
  boardTitleInput.style.width =
    Math.min(Math.max(textWidth + 24, 120), window.innerWidth * 0.8) + "px";
}

export async function initTitleInput() {
  if (!boardTitleInput) {
    return;
  }

  const { boardTitle } = getState();
  let displayTitle = boardTitle;
  if (boardTitle === "Untitled Board") {
    const [translated] = await document.l10n.formatValues([
      { id: "zen-board-untitled-board" },
    ]);
    if (translated) {
      displayTitle = translated;
    }
  }
  boardTitleInput.value = displayTitle;
  document.title = displayTitle;
  try {
    const browserEl = window.docShell?.chromeEventHandler;
    const tab = browserEl?.ownerDocument?.defaultView?.gBrowser?.getTabForBrowser(browserEl);
    if (tab) {
      tab.zenStaticLabel = displayTitle;
    }
  } catch (e) {
    console.warn("ZenBoard: Failed to set tab label:", e);
  }
  adjustWidth();

  boardTitleInput.addEventListener("input", async () => {
    adjustWidth();
    const newTitle = boardTitleInput.value.trim() || "Untitled Board";
    setState({ boardTitle: newTitle });

    let displayTitle = newTitle;
    if (newTitle === "Untitled Board") {
      const [translated] = await document.l10n.formatValues([
        { id: "zen-board-untitled-board" },
      ]);
      if (translated) {
        displayTitle = translated;
      }
    }
    document.title = displayTitle;

    try {
      const browserEl = window.docShell?.chromeEventHandler;
      const tab = browserEl?.ownerDocument?.defaultView?.gBrowser?.getTabForBrowser(browserEl);
      if (tab) {
        tab.zenStaticLabel = displayTitle;
      }
    } catch (e) {
      console.warn("ZenBoard: Failed to set tab label:", e);
    }

    triggerSaveImmediate();
  });

  boardTitleInput.addEventListener("focus", () => boardTitleInput.select());
  boardTitleInput.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === "Escape") {
      boardTitleInput.blur();
    }
  });
}

export function adjustTitleInputWidth() {
  adjustWidth();
}
