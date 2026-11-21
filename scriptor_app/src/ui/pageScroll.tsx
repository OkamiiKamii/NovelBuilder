// A page that types: the focused box always scrolls above the on-screen keyboard. Android draws apps edge to edge, so
// the window never shrinks for the keyboard; this makes the room. A drop-in for ScrollView on pages with text boxes.

import { forwardRef } from 'react';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

type Props = React.ComponentProps<typeof KeyboardAwareScrollView>;

/** Space kept between the keyboard and the line being typed. */
export const keyboardGap = 24;

export const PageScroll = forwardRef<KeyboardAwareScrollViewRef, Props>(function PageScroll(
  { bottomOffset = keyboardGap, keyboardShouldPersistTaps = 'handled', ...rest },
  ref,
) {
  return <KeyboardAwareScrollView ref={ref} bottomOffset={bottomOffset} keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...rest} />;
});
