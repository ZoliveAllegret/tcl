import { useColorScheme as useColorSchemeCore } from "react-native";

export function useColorScheme(): "light" | "dark" {
  return useColorSchemeCore() === "dark" ? "dark" : "light";
}
