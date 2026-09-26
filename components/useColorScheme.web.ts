import { useEffect, useState } from "react";
import { useColorScheme as useColorSchemeCore } from "react-native";

/**
 * Le rendu statique se fait toujours en clair : on bascule sur le réglage
 * du navigateur après l'hydratation pour éviter un décalage serveur/client.
 */
export function useColorScheme(): "light" | "dark" {
  const scheme = useColorSchemeCore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted && scheme === "dark" ? "dark" : "light";
}
