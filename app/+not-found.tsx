import { router, Stack } from "expo-router";
import { View } from "react-native";

import { Button, EmptyState } from "@/components/ui";
import { makeStyles } from "@/src/theme";

export default function NotFoundScreen() {
  const styles = useStyles();
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "" }} />
      <EmptyState
        icon="place"
        title="Page introuvable"
        message="Cette adresse ne correspond à aucun écran de l'app."
        action={<Button label="Retour à l'accueil" icon="search" onPress={() => router.replace("/")} />}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  screen: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: t.colors.background,
  },
}));
