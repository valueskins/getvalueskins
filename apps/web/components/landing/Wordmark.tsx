/** "Value" in the page's sans, "Skins" in the serif italic, in the accent. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className ? `v3-wordmark ${className}` : 'v3-wordmark'}>
      Value<em>Skins</em>
    </span>
  );
}
