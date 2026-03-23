import React, { useState } from 'react';

interface HintButtonProps {
  hint: string | null;
  onHintUsed: () => void;
}

export function HintButton({ hint, onHintUsed }: HintButtonProps): React.ReactElement | null {
  const [shown, setShown] = useState(false);

  if (hint === null) {
    return null;
  }

  if (shown) {
    return <div>{hint}</div>;
  }

  return (
    <button
      onClick={() => {
        setShown(true);
        onHintUsed();
      }}
    >
      Show Hint
    </button>
  );
}
