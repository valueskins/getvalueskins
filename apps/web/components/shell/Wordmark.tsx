/** "Value" in the sans, "Skins" in the serif italic, in the accent. Reads as one word: ValueSkins. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className ? `wordmark ${className}` : 'wordmark'}>
      Value<em>Skins</em>
    </span>
  );
}
