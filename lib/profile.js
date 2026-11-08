// A local identity for this browser, not an account or a synced public profile.
const Profile = {
  COLORS: ['#8b7cf8', '#26bfa6', '#f2aa65', '#e276af', '#5ea8ec'],
  normalize(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      name: String(input.name || '').trim().slice(0, 40),
      bio: String(input.bio || '').trim().slice(0, 120),
      color: this.COLORS.includes(input.color) ? input.color : this.COLORS[0],
    };
  },
  initials(value) {
    const name = this.normalize(value).name;
    return name ? name.split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join('') : '✦';
  },
};
