import "react-native-get-random-values";
import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signWithApiKey, ApiKeyStamper } from "@turnkey/api-key-stamper";
import {
  generateP256KeyPair,
  decryptBundle,
  getPublicKey,
} from "@turnkey/crypto";
import {
  stringToBase64urlString,
  uint8ArrayToHexString,
  uint8ArrayFromHexString,
} from "@turnkey/encoding";
import { TurnkeyClient } from "@turnkey/http";

// Storage keys
const STORAGE_KEYS = {
  EMBEDDED_KEY: "@turnkey/auth_embedded_key",
  CREDENTIAL_BUNDLE: "@turnkey/auth_credential_bundle",
};

const getPublicKeyFromPrivateKeyHex = (privateKey: string): string => {
  return uint8ArrayToHexString(
    getPublicKey(uint8ArrayFromHexString(privateKey), true)
  );
};

const AuthScreen = () => {
  const [embeddedKey, setEmbeddedKey] = useState<any>(null);
  const [credentialBundle, setCredentialBundle] = useState("");
  const [payload, setPayload] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [decryptedData, setDecryptedData] = useState("");
  const [signature, setSignature] = useState("");
  const [organizationID, setOrganizationID] = useState("");
  const [userID, setUserID] = useState("");

  // Load stored data on component mount
  useEffect(() => {
    loadStoredData();
  }, []);

  const loadStoredData = async () => {
    try {
      const storedEmbeddedKey = await AsyncStorage.getItem(
        STORAGE_KEYS.EMBEDDED_KEY
      );
      const storedCredentialBundle = await AsyncStorage.getItem(
        STORAGE_KEYS.CREDENTIAL_BUNDLE
      );

      if (!storedEmbeddedKey) {
        // If no embedded key exists, generate a new one
        handleGenerateKey();
      } else {
        setEmbeddedKey(storedEmbeddedKey);
        const targetPubHex = getPublicKeyFromPrivateKeyHex(storedEmbeddedKey);
        setPublicKey(targetPubHex);
      }

      if (storedCredentialBundle) {
        setCredentialBundle(storedCredentialBundle);
      }
    } catch (error) {
      console.error("Error loading stored data:", error);
    }
  };

  const handleGenerateKey = async () => {
    try {
      const key = generateP256KeyPair();
      const privateKey = key.privateKey;
      const targetPubHex = key.publicKeyUncompressed;

      // Store and set the embedded key
      await AsyncStorage.setItem(STORAGE_KEYS.EMBEDDED_KEY, privateKey);
      setEmbeddedKey(privateKey);

      console.log("Target Public key:", targetPubHex);
      setPublicKey(targetPubHex!);
    } catch (error) {
      console.error("Error generating key:", error);
    }
  };

  const handleInjectBundle = async () => {
    try {
      // Store the credential bundle
      await AsyncStorage.setItem(
        STORAGE_KEYS.CREDENTIAL_BUNDLE,
        credentialBundle
      );

      const decryptedData = decryptBundle(
        credentialBundle,
        embeddedKey
      ) as Uint8Array;

      setDecryptedData(uint8ArrayToHexString(decryptedData));
    } catch (error) {
      console.error("Error injecting bundle:", error);
    }
  };

  const handleClearStorage = async () => {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.EMBEDDED_KEY,
        STORAGE_KEYS.CREDENTIAL_BUNDLE,
      ]);
      setEmbeddedKey(null);
      setCredentialBundle("");
      setPublicKey("");
      setDecryptedData("");
      console.log("Storage cleared successfully");
    } catch (error) {
      console.error("Error clearing storage:", error);
    }
  };

  // Rest of the code remains the same
  const handleWhoami = async () => {
    if (!decryptedData) {
      console.error("unable to get whoami; must have decrypted data");
      return;
    }

    const privateKey = decryptedData;
    const publicKey = getPublicKeyFromPrivateKeyHex(privateKey);

    const turnkeyClient = new TurnkeyClient(
      { baseUrl: "https://api.turnkey.com" },
      new ApiKeyStamper({
        apiPublicKey: publicKey,
        apiPrivateKey: privateKey,
      })
    );

    const whoamiResponse = await turnkeyClient.getWhoami({
      // This value can be the suborg ID, or its parent org ID (which is sufficient to find out "who you are")
      organizationId: process.env.EXPO_PUBLIC_TURNKEY_ORGANIZATION_ID!,
    });

    setOrganizationID(whoamiResponse.organizationId);
    setUserID(whoamiResponse.userId);
  };

  const handleStampPayload = async () => {
    try {
      const publicKey = uint8ArrayToHexString(
        getPublicKey(uint8ArrayFromHexString(decryptedData), true)
      );
      const privateKey = decryptedData;
      const signature = await signWithApiKey({
        content: payload,
        publicKey,
        privateKey,
      });
      setSignature(signature);
      const stamp = {
        publicKey: publicKey,
        scheme: "SIGNATURE_SCHEME_TK_API_P256",
        signature: signature,
      };
      console.log("X-Stamp:", stringToBase64urlString(JSON.stringify(stamp))); // use this as your X-Stamp in your requests
    } catch (error) {
      console.error("Error stamping payload:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text>Email Authentication</Text>
      <Text>Embedded Key: {publicKey}</Text>
      <TextInput
        style={styles.input}
        onChangeText={setCredentialBundle}
        value={credentialBundle}
        placeholder="Enter Credential Bundle"
      />
      <Button
        title="Inject Bundle"
        onPress={handleInjectBundle}
      />
      <TextInput
        style={styles.input}
        onChangeText={setPayload}
        value={payload}
        placeholder="Enter Payload"
      />
      <Button
        title="Stamp Payload"
        onPress={handleStampPayload}
      />
      <Text>Decrypted Key: {decryptedData}</Text>
      <Text>Signature: {signature}</Text>
      <Button
        title="whoami?"
        onPress={handleWhoami}
      />
      <Button
        title="Clear Storage"
        onPress={handleClearStorage}
      />
      <Text>Organization ID: {organizationID}</Text>
      <Text>User ID: {userID}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  input: {
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
    width: "100%",
  },
});

export default AuthScreen;
