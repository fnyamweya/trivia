export interface AvatarOption {
  id: string;
  emoji: string;
  name: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'astro', emoji: '🧑‍🚀', name: 'Astronaut' },
  { id: 'scholar', emoji: '🧑‍🎓', name: 'Scholar' },
  { id: 'coder', emoji: '🧑‍💻', name: 'Coder' },
  { id: 'artist', emoji: '🧑‍🎨', name: 'Artist' },
  { id: 'scientist', emoji: '🧑‍🔬', name: 'Scientist' },
  { id: 'chef', emoji: '🧑‍🍳', name: 'Chef' },
  { id: 'firefighter', emoji: '🧑‍🚒', name: 'Firefighter' },
  { id: 'farmer', emoji: '🧑‍🌾', name: 'Farmer' },
  { id: 'ninja', emoji: '🥷', name: 'Ninja' },
  { id: 'wizard', emoji: '🧙', name: 'Wizard' },
  { id: 'runner', emoji: '🏃', name: 'Runner' },
  { id: 'athlete', emoji: '🤾', name: 'Athlete' },
];

export function getAvatarById(avatarId?: string | null): AvatarOption {
  return AVATAR_OPTIONS.find((avatar) => avatar.id === avatarId) ?? AVATAR_OPTIONS[0];
}

export function getAvatarForNickname(nickname: string): AvatarOption {
  if (!nickname) {
    return AVATAR_OPTIONS[0];
  }

  let hash = 0;
  for (let index = 0; index < nickname.length; index++) {
    hash = (hash * 31 + nickname.charCodeAt(index)) % AVATAR_OPTIONS.length;
  }

  return AVATAR_OPTIONS[Math.abs(hash) % AVATAR_OPTIONS.length];
}
