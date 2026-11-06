import { useEffect, useRef } from "react";
import { startGame } from "./game/main.js";

// The game itself is framework-free vanilla JS (src/game). React only provides
// the mount point for the canvas + HUD.
export default function App() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = startGame(ref.current!);
    return () => game.destroy();
  }, []);

  return <div ref={ref} className="fixed inset-0 overflow-hidden bg-[#3f93d6]" />;
}
