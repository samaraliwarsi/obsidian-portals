import type { IconProvider } from './iconProvider';
import { EMOJI_LIST } from './emojiList';

export class EmojiIconProvider implements IconProvider {
    name = 'Emoji';

    getIconList(): string[] {
        return EMOJI_LIST.map(e => e.char);
    }

    renderIcon(element: HTMLElement, iconName: string): void {
        element.empty();
        element.addClass('portals-emoji-icon');
        element.setText(iconName);
    }
}