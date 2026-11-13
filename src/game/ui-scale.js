// Interface scale for small screens. The menus and HUD are sized in CSS pixels for a screen about 700 px tall; a phone held sideways has only 350-430 of them (CSS pixels do not
// grow with the phone's pixel density: it is the short screen that makes everything look oversized). Below 700 px of height everything shrinks with it, down to 55%.
// applyUiScale() sets the CSS variable --ui (the stylesheet zooms the menus and the text HUD by it); uiScale() is the same number for the code that places things itself.
export const uiScale = () => Math.min(1, Math.max(.55, innerHeight / 700));
let on = false;
export function applyUiScale() {
  if (on) return; on = true;
  const set = () => document.documentElement.style.setProperty('--ui', uiScale().toFixed(3));
  set(); addEventListener('resize', set);
}
