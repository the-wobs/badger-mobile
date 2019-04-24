// @flow
import React, { useState } from "react";
import { connect } from "react-redux";
import styled from "styled-components";
import {
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  View,
  Image
} from "react-native";

import makeBlockie from "ethereum-blockies-base64";
import Swipeable from "react-native-swipeable";
import Ionicons from "react-native-vector-icons/Ionicons";

import SLPSDK from "slp-sdk";

import BitcoinCashImage from "../assets/images/icon.png";
import { Button, T, H1, H2, Spacer } from "../atoms";

import { type TokenData } from "../data/tokens/reducer";
import { tokensByIdSelector } from "../data/tokens/selectors";

import {
  signAndPublishBchTransaction,
  signAndPublishSlpTransaction
} from "../utils/transaction-utils";

import {
  getKeypairSelector,
  activeAccountSelector
} from "../data/accounts/selectors";
import { utxosByAccountSelector } from "../data/utxos/selectors";

const SLP = new SLPSDK();

const IconArea = styled(View)`
  align-items: center;
  justify-content: center;
`;
const IconImage = styled(Image)`
  width: 64;
  height: 64;
  border-radius: 32;
  overflow: hidden;
`;

const SwipeButtonContainer = styled(View)`
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 32px;
  width: 75%;
  align-self: center;
`;

const ButtonsContainer = styled(View)`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const SwipeContent = styled(View)`
  height: 64px;
  padding-right: 10px;
  align-items: flex-end;
  justify-content: center;
  background-color: ${props =>
    props.activated ? props.theme.success500 : props.theme.pending500};
`;

const SwipeMainContent = styled(View)`
  height: 64px;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  background-color: ${props =>
    props.triggered ? props.theme.success500 : props.theme.primary500};
`;

type Props = {
  tokensById: { [tokenId: string]: TokenData },
  utxos: any,
  keypair: any,
  activeAccount: any,
  navigation: {
    navigate: Function,
    state?: {
      params: {
        symbol: string,
        tokenId: ?string,
        sendAmount: string,
        toAddress: string
      }
    }
  }
};

const SendConfirmScreen = ({
  navigation,
  tokensById,
  activeAccount,
  utxos,
  keypair
}: Props) => {
  const [confirmSwipeActivated, setConfirmSwipeActivated] = useState(false);

  // TODO - Consider moving this into redux
  const [
    transactionState: "setup" | "signing" | "broadcasting" | "sent",
    setTransactionState
  ] = useState("setup");

  const { symbol, tokenId, sendAmount, toAddress } = (navigation.state &&
    navigation.state.params) || {
    symbol: null,
    tokenId: null,
    sendAmount: null,
    toAddress: ""
  };

  const decimals = tokenId ? tokensById[tokenId].decimals : 8;

  const sendAmountFormatted = parseFloat(sendAmount);

  // Convert BCH amount to satoshis
  // Send the entered token amount as is
  const sendAmountParam = tokenId
    ? sendAmountFormatted
    : Math.floor(sendAmountFormatted * 10 ** decimals);

  const signSendTransaction = async () => {
    setTransactionState("signing");

    const utxoWithKeypair = utxos.map(utxo => ({
      ...utxo,
      keypair:
        utxo.address === activeAccount.address ? keypair.bch : keypair.slp
    }));

    const spendableUTXOS = utxoWithKeypair.filter(utxo => utxo.spendable);

    let txParams = {};
    try {
      if (tokenId) {
        const spendableTokenUtxos = utxoWithKeypair.filter(utxo => {
          return (
            utxo.slp &&
            utxo.slp.baton === false &&
            utxo.validSlpTx === true &&
            utxo.slp.token === tokenId
          );
        });
        // Sign and send SLP Token tx
        txParams = {
          to: SLP.Address.toCashAddress(toAddress),
          from: activeAccount.address,
          value: sendAmountParam,
          sendTokenData: { tokenId }
        };

        await signAndPublishSlpTransaction(
          txParams,
          spendableUTXOS,
          {
            decimals
          },
          spendableTokenUtxos,
          activeAccount.addressSlp
        );
      } else {
        console.log("sending BCH transaction");
        // Sign and send BCH tx
        txParams = {
          to: toAddress,
          from: activeAccount.address,
          value: sendAmountParam
        };

        await signAndPublishBchTransaction(txParams, spendableUTXOS);
      }
    } catch (e) {
      throw new Error("Error sending transaction");
    }
    navigation.navigate("SendSuccess", { txParams });
  };
  // Return to setup if any tx params are missing
  if (!symbol || (!tokenId && symbol !== "BCH") || !sendAmount || !toAddress) {
    navigation.navigate("SendSetup", { symbol, tokenId });
  }

  const imageSource =
    symbol === "BCH" && !tokenId
      ? BitcoinCashImage
      : { uri: makeBlockie(tokenId) };

  const coinName =
    symbol === "BCH" && !tokenId ? "Bitcoin Cash" : tokensById[tokenId].name;

  // toAddress like
  // -> simpleledger:qq2addressHash
  // -> l344f3legacyFormatted
  const addressParts = toAddress.split(":");
  const address = addressParts.length === 2 ? addressParts[1] : addressParts[0];
  const protocol = addressParts.length === 2 ? addressParts[0] : "legacy";

  const addressStart = address.slice(0, 5);
  const addressMiddle = address.slice(5, -6);
  const addressEnd = address.slice(-6);

  return (
    <SafeAreaView style={{ height: "100%" }}>
      <Spacer />
      <H1 center>Confirm Transaction</H1>
      <Spacer small />
      <IconArea>
        <IconImage source={imageSource} />
      </IconArea>
      <Spacer small />
      <H2 center>
        {coinName} ({symbol})
      </H2>
      {tokenId && (
        <T size="tiny" center>
          {tokenId}
        </T>
      )}
      <Spacer />
      <H2 center>Sending</H2>
      <Spacer small />
      <H2 center>
        {sendAmount} {symbol}
      </H2>
      <Spacer large />
      <H2 center>To Address</H2>
      <Spacer small />
      <T size="small" center>
        {protocol}:
      </T>
      <T center>
        <T style={{ fontWeight: "bold" }}>{addressStart}</T>
        <T size="small">{addressMiddle}</T>
        <T style={{ fontWeight: "bold" }}>{addressEnd}</T>
      </T>

      <ButtonsContainer>
        <SwipeButtonContainer>
          {transactionState === "signing" ? (
            <ActivityIndicator size="large" />
          ) : (
            <Swipeable
              leftActionActivationDistance={
                Dimensions.get("window").width * 0.75 * 0.8
              }
              leftContent={
                <SwipeContent activated={confirmSwipeActivated}>
                  {confirmSwipeActivated ? (
                    <T type="inverse">Release to send</T>
                  ) : (
                    <T type="inverse">Keep pulling</T>
                  )}
                </SwipeContent>
              }
              onLeftActionActivate={() => setConfirmSwipeActivated(true)}
              onLeftActionDeactivate={() => setConfirmSwipeActivated(false)}
              onLeftActionComplete={() => signSendTransaction()}
            >
              <SwipeMainContent triggered={transactionState === "signing"}>
                <T weight="bold" type="inverse">
                  Swipe{" "}
                </T>
                <T weight="bold" type="inverse" style={{ paddingTop: 2 }}>
                  <Ionicons name="ios-arrow-round-forward" size={25} />
                </T>
                <T weight="bold" type="inverse">
                  {" "}
                  To Send
                </T>
              </SwipeMainContent>
            </Swipeable>
          )}
        </SwipeButtonContainer>
        <Spacer />
        {transactionState !== "signing" && (
          <Button
            nature="cautionGhost"
            text="Cancel Transaction"
            onPress={() => navigation.goBack()}
          />
        )}
      </ButtonsContainer>
    </SafeAreaView>
  );
};

const mapStateToProps = state => {
  const tokensById = tokensByIdSelector(state);
  const activeAccount = activeAccountSelector(state);
  const utxos = utxosByAccountSelector(state, activeAccount.address);
  const keypair = getKeypairSelector(state);

  return {
    activeAccount,
    tokensById,
    keypair,
    utxos
  };
};

export default connect(mapStateToProps)(SendConfirmScreen);
