import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";

export default function Details() {
    const params = useLocalSearchParams();
    console.log(params.name);
  return (
    <ScrollView contentContainerStyle={{gap: 16, padding: 16}}>

    </ScrollView>
  );
}

const styles = StyleSheet.create({});