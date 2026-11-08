// Dashboard-only keyboard shortcuts. Browser-wide capture hotkeys are owned by
// chrome://extensions/shortcuts and cannot be reassigned via extension code.
const Shortcuts = {
  DEFAULT: 'Mod+Shift+P',
  OPTIONS: [
    { value: 'Mod+Shift+P', label: 'Ctrl/⌘ + Shift + P' },
    { value: 'Mod+K', label: 'Ctrl/⌘ + K' },
    { value: 'Alt+K', label: 'Alt + K' },
    { value: 'Mod+Shift+K', label: 'Ctrl/⌘ + Shift + K' },
    { value: 'Off', label: 'Off (use the Commands button)' },
  ],

  valid(value) {
    return this.OPTIONS.some((option) => option.value === value) ||
      /^(Mod|Alt)\+(Shift\+)?[A-Z0-9]$/.test(value || '');
  },
  label(value) {
    const preset = this.OPTIONS.find((option) => option.value === value);
    return preset ? preset.label : (this.valid(value) ? value.replace('Mod', 'Ctrl/⌘') : this.OPTIONS[0].label);
  },
  fromEvent(event) {
    const key = String(event.key || '').toUpperCase();
    if (!/^[A-Z0-9]$/.test(key)) return null;
    const mod = event.ctrlKey || event.metaKey;
    if ((event.ctrlKey && event.metaKey) || mod === !!event.altKey) return null;
    // Require one primary modifier, never Ctrl+Alt (AltGr) or Ctrl+Command.
    return (mod ? 'Mod' : 'Alt') + '+' + (event.shiftKey ? 'Shift+' : '') + key;
  },
  matches(event, value) {
    if (!this.valid(value) || value === 'Off' || event.repeat) return false;
    const [modifier, maybeShift, last] = value.split('+');
    const key = last || maybeShift;
    const shift = maybeShift === 'Shift';
    if (event.key.toLowerCase() !== key.toLowerCase() || event.shiftKey !== shift) return false;
    if (modifier === 'Alt') return event.altKey && !event.ctrlKey && !event.metaKey;
    return (event.ctrlKey || event.metaKey) && !(event.ctrlKey && event.metaKey) && !event.altKey;
  },
};
