// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import { ExchangeOnChain, OrderSigner, TransactionBuilder } from "@dipcoinlab/perp-ts-library";
import { SuiClient, SuiTransactionBlockResponse, getFullnodeUrl } from "@mysten/sui/client";
import { Keypair } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import BigNumber from "bignumber.js";
import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { API_ENDPOINTS, DECIMALS, ONBOARDING_MESSAGE, PYTH_CONFIG } from "../constants";
import { HttpClient } from "../services/httpClient";
import {
  AccountInfo,
  AccountInfoParams,
  AccountInfoResponse,
  AdjustLeverageParams,
  BalanceChange,
  BalanceChangesParams,
  CancelOrderParams,
  CancelTpSlOrdersParams,
  DipCoinPerpSDKOptions,
  FundingSettlement,
  FundingSettlementsParams,
  HistoryOrder,
  HistoryOrdersParams,
  MarginAdjustmentParams,
  OpenOrder,
  OpenOrdersParams,
  OpenOrdersResponse,
  OrderBook,
  OrderBookEntry,
  OrderResponse,
  OrderSide,
  OrderType,
  PageResponse,
  PlaceOrderParams,
  PlaceTpSlOrdersParams,
  PlaceTpSlOrdersResult,
  Position,
  PositionTpSlOrder,
  PositionsParams,
  PositionsResponse,
  SDKResponse,
  Ticker,
  TpSlMode,
  TpSlOrderConfig,
  TradingPair,
  TradingPairsResponse,
  UserConfig
} from "../types";
import {
  formatError,
  formatNormalToWei,
  formatNormalToWeiBN,
  fromExportedKeypair,
  readFile,
  signMessage,
} from "../utils";

/**
 * DipCoin Perpetual Trading SDK
 */
export class DipCoinPerpSDK {
  private httpClient: HttpClient;
  private keypair: Keypair;
  private subKeypair?: Keypair;
  private walletAddress: string;
  private subAddress?: string;
  private options: DipCoinPerpSDKOptions;
  private jwtToken?: string;
  private subJwtToken?: string;
  private isAuthenticating: boolean = false;
  private isSubAuthenticating: boolean = false;
  private exchangeOnChain: ExchangeOnChain;
  private deploymentConfig: any;
  private suiClient: SuiClient;
  private transactionBuilder: TransactionBuilder;
  private priceServiceConnection?: SuiPriceServiceConnection;
  private pythClient?: SuiPythClient;
  private tradingPairsCache?: TradingPair[];
  private tradingPairsCacheTimestamp?: number;

  /**
   * Initialize SDK
   * @param privateKey Private key string or keypair
   * @param options SDK configuration options
   */
  constructor(privateKey: string | Keypair, options: DipCoinPerpSDKOptions) {
    this.options = options;
    this.httpClient = new HttpClient(options.apiBaseUrl);

    // Initialize main keypair
    if (typeof privateKey === "string") {
      this.keypair = fromExportedKeypair(privateKey);
    } else {
      this.keypair = privateKey;
    }

    // Initialize sub-account keypair if provided
    if (options.subAccountKey) {
      this.subKeypair = fromExportedKeypair(options.subAccountKey);
      this.subAddress = this.subKeypair.getPublicKey().toSuiAddress();
    }

    // Get wallet address
    this.walletAddress = this.keypair.getPublicKey().toSuiAddress();
    this.httpClient.setWalletAddress(this.walletAddress);
    this.deploymentConfig = readFile(`config/deployed/${options.network}/main_contract.json`);
    const rpcUrl = options.customRpc || getFullnodeUrl(options.network);
    this.suiClient = new SuiClient({ url: rpcUrl });
    this.exchangeOnChain = new ExchangeOnChain(this.deploymentConfig, this.suiClient, this.keypair);

    const packageId = this.getDeploymentPackageId();
    const protocolConfigId = this.getDeploymentProtocolConfigId();
    this.transactionBuilder = new TransactionBuilder(
      packageId,
      protocolConfigId,
      this.deploymentConfig,
      this.suiClient as any
    );
  }

  /**
   * Get wallet address
   */
  get address(): string {
    return this.walletAddress;
  }

  /**
   * Get sub-account wallet address (if configured)
   */
  get subAccountAddress(): string | undefined {
    return this.subAddress;
  }

  /**
   * Get SDK options
   */
  get optionsField(): DipCoinPerpSDKOptions {
    return this.options;
  }

  /**
   * Authenticate and get JWT token (onboarding)
   * This method signs the onboarding message and exchanges it for a JWT token
   * @returns JWT token
   */
  async authenticate(): Promise<SDKResponse<string>> {
    try {
      // If already authenticated and token exists, return it
      if (this.jwtToken) {
        return {
          status: true,
          data: this.jwtToken,
        };
      }

      // Prevent concurrent authentication requests
      if (this.isAuthenticating) {
        // Wait for ongoing authentication
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (this.jwtToken) {
          return {
            status: true,
            data: this.jwtToken,
          };
        }
      }

      this.isAuthenticating = true;

      // 1. Prepare onboarding message
      const messageBytes = new TextEncoder().encode(ONBOARDING_MESSAGE);

      // 2. Sign the message
      const signature = await signMessage(this.keypair, messageBytes);

      // 3. Call authorize endpoint to get JWT token
      const response = await this.httpClient.post<{ token: string }>(API_ENDPOINTS.AUTHORIZE, {
        userAddress: this.walletAddress,
        isTermAccepted: true,
        signature: signature,
      });

      if (response.code === 200 && response.data?.token) {
        this.jwtToken = response.data.token;
        this.httpClient.setAuthToken(this.jwtToken);
        this.isAuthenticating = false;
        return {
          status: true,
          data: this.jwtToken,
        };
      } else {
        this.isAuthenticating = false;
        return {
          status: false,
          error: response.message || "Failed to authenticate",
        };
      }
    } catch (error) {
      this.isAuthenticating = false;
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Authenticate sub-account and get JWT token
   * Used for trading operations when sub-account is configured
   */
  async authenticateSub(): Promise<SDKResponse<string>> {
    if (!this.subKeypair) {
      return { status: false, error: "Sub-account keypair not configured" };
    }

    try {
      if (this.subJwtToken) {
        return { status: true, data: this.subJwtToken };
      }

      if (this.isSubAuthenticating) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (this.subJwtToken) {
          return { status: true, data: this.subJwtToken };
        }
      }

      this.isSubAuthenticating = true;

      const messageBytes = new TextEncoder().encode(ONBOARDING_MESSAGE);
      const signature = await signMessage(this.subKeypair, messageBytes);
      const subAddress = this.subKeypair.getPublicKey().toSuiAddress();

      const response = await this.httpClient.post<{ token: string }>(API_ENDPOINTS.AUTHORIZE, {
        userAddress: subAddress,
        isTermAccepted: true,
        signature: signature,
      });

      if (response.code === 200 && response.data?.token) {
        this.subJwtToken = response.data.token;
        this.isSubAuthenticating = false;
        return { status: true, data: this.subJwtToken };
      } else {
        this.isSubAuthenticating = false;
        return { status: false, error: response.message || "Failed to authenticate sub-account" };
      }
    } catch (error) {
      this.isSubAuthenticating = false;
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Authenticate for trading operations
   * Uses sub-account if configured, otherwise falls back to main account
   */
  private async authenticateForTrading(): Promise<SDKResponse<string>> {
    if (this.subKeypair) {
      const subAuth = await this.authenticateSub();
      if (subAuth.status && subAuth.data) {
        this.httpClient.setAuthToken(subAuth.data);
        if (this.subAddress) {
          this.httpClient.setWalletAddress(this.subAddress);
        }
        return subAuth;
      }
      return subAuth;
    }
    return this.authenticate();
  }

  /**
   * Restore main account auth context after trading operations
   */
  private restoreMainAuth(): void {
    this.httpClient.setWalletAddress(this.walletAddress);
    if (this.jwtToken) {
      this.httpClient.setAuthToken(this.jwtToken);
    }
  }

  /**
   * Get JWT token, authenticate if needed
   * @param forceRefresh Force refresh the token even if one exists
   * @returns JWT token
   */
  async getJWTToken(forceRefresh: boolean = false): Promise<SDKResponse<string>> {
    if (forceRefresh) {
      this.jwtToken = undefined;
      this.httpClient.setAuthToken("");
    }
    return this.authenticate();
  }

  /**
   * Clear JWT token (logout)
   */
  clearAuth(): void {
    this.jwtToken = undefined;
    this.subJwtToken = undefined;
    this.httpClient.setAuthToken("");
  }

  /**
   * Place an order
   * @param params Order parameters
   * @returns Order response
   */
  async placeOrder(params: PlaceOrderParams): Promise<SDKResponse<OrderResponse>> {
    try {
      // Use sub-account auth for trading if configured
      const authResult = await this.authenticateForTrading();
      if (!authResult.status) {
        this.restoreMainAuth();
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      // Validate required parameters
      if (
        !params.symbol ||
        !params.side ||
        !params.orderType ||
        !params.quantity ||
        !params.leverage
      ) {
        throw new Error("Missing required order parameters");
      }

      if (params.orderType === OrderType.LIMIT && !params.price) {
        throw new Error("Price is required for LIMIT orders");
      }

      const {
        symbol,
        side,
        orderType,
        quantity,
        price,
        leverage,
        market,
        reduceOnly = false,
        clientId = "",
        creator,
        tpTriggerPrice,
        tpOrderType = OrderType.MARKET,
        tpOrderPrice = "",
        slTriggerPrice,
        slOrderType = OrderType.MARKET,
        slOrderPrice = "",
      } = params;

      // Resolve creator: explicit creator (vault address), or main wallet address
      const orderCreator = creator || this.walletAddress;
      // Use sub-account keypair for signing if available, otherwise main keypair
      const signingKeypair = this.subKeypair || this.keypair;

      // Validate market parameter - it must be a PerpetualID, not a symbol
      if (!market) {
        throw new Error(
          "Market (PerpetualID) is required. Please provide the market parameter with the PerpetualID for the trading pair."
        );
      }

      // Convert to BigNumber for calculations
      // For MARKET orders, price can be empty string, which will be converted to 0
      const priceBN = price && price !== "" ? formatNormalToWeiBN(price) : new BigNumber(0);
      const quantityBN = formatNormalToWeiBN(quantity);
      const leverageBN = formatNormalToWeiBN(leverage);
      const expirationBN = new BigNumber(0);
      const saltBN = new BigNumber(+new Date());

      // Build main order object
      // Note: market must be the PerpetualID (e.g., "0xc1b1cf3d774bcfcbd6d71158a4259f2d99fccbf64ffc34f32700f8a771587d99")
      const order = {
        market: market,
        creator: orderCreator,
        isLong: side === OrderSide.BUY,
        reduceOnly,
        postOnly: false,
        orderbookOnly: true,
        ioc: false,
        quantity: quantityBN,
        price: orderType === OrderType.LIMIT ? priceBN : new BigNumber(0),
        leverage: leverageBN,
        expiration: expirationBN,
        salt: saltBN,
      };

      // Build TP order if trigger price is provided
      let tpOrder = null;
      let tpSalt = null;
      if (tpTriggerPrice) {
        tpSalt = new BigNumber(Date.now() + 1);
        tpOrder = {
          market: order.market,
          creator: orderCreator,
          isLong: !order.isLong,
          reduceOnly: true,
          postOnly: false,
          orderbookOnly: true,
          ioc: false,
          quantity: quantityBN,
          price:
            tpOrderType === OrderType.LIMIT
              ? formatNormalToWeiBN(tpOrderPrice || tpTriggerPrice)
              : formatNormalToWeiBN(""),
          leverage: leverageBN,
          expiration: expirationBN,
          salt: tpSalt,
        };
      }

      // Build SL order if trigger price is provided
      let slOrder = null;
      let slSalt = null;
      if (slTriggerPrice) {
        slSalt = new BigNumber(Date.now() + 2);
        slOrder = {
          market: order.market,
          creator: orderCreator,
          isLong: !order.isLong,
          reduceOnly: true,
          postOnly: false,
          orderbookOnly: true,
          ioc: false,
          quantity: quantityBN,
          price:
            slOrderType === OrderType.LIMIT
              ? formatNormalToWeiBN(slOrderPrice || slTriggerPrice)
              : formatNormalToWeiBN(""),
          leverage: leverageBN,
          expiration: expirationBN,
          salt: slSalt,
        };
      }

      // Generate order message for signing
      const orderMsg = OrderSigner.getOrderMessageForUIWallet(order);
      const orderHashBytes = new TextEncoder().encode(orderMsg);

      // Sign main order
      const orderSignature = await signMessage(signingKeypair, orderHashBytes);

      // Sign TP order if exists
      let tpOrderSignature: string | undefined;
      if (tpOrder) {
        const tpOrderMsg = OrderSigner.getOrderMessageForUIWallet(tpOrder);
        const tpOrderHashBytes = new TextEncoder().encode(tpOrderMsg);
        tpOrderSignature = await signMessage(signingKeypair, tpOrderHashBytes);
      }

      // Sign SL order if exists
      let slOrderSignature: string | undefined;
      if (slOrder) {
        const slOrderMsg = OrderSigner.getOrderMessageForUIWallet(slOrder);
        const slOrderHashBytes = new TextEncoder().encode(slOrderMsg);
        slOrderSignature = await signMessage(signingKeypair, slOrderHashBytes);
      }

      // Build request parameters
      // Match ts-frontend: always use formatNormalToWei(price) regardless of order type
      // For MARKET orders, price will be empty string which converts to "0"
      const requestParams: Record<string, any> = {
        symbol,
        side,
        orderType,
        quantity: formatNormalToWei(quantity),
        price: formatNormalToWei(price || ""),
        leverage: formatNormalToWei(leverage),
        salt: saltBN.toString(),
        creator: orderCreator,
        clientId,
        reduceOnly,
        orderSignature,
      };

      // Add TP parameters if exists
      if (tpTriggerPrice && tpOrderSignature) {
        requestParams.tpOrderSignature = tpOrderSignature;
        requestParams.tpTriggerPrice = formatNormalToWei(tpTriggerPrice);
        requestParams.tpOrderType = tpOrderType;
        requestParams.tpOrderPrice =
          tpOrderType === OrderType.LIMIT
            ? formatNormalToWei(tpOrderPrice || tpTriggerPrice)
            : formatNormalToWei("");
        requestParams.tpSalt = tpSalt?.toString();
        requestParams.triggerWay = "oracle";
      }

      // Add SL parameters if exists
      if (slTriggerPrice && slOrderSignature) {
        requestParams.slOrderSignature = slOrderSignature;
        requestParams.slTriggerPrice = formatNormalToWei(slTriggerPrice);
        requestParams.slOrderType = slOrderType;
        requestParams.slOrderPrice =
          slOrderType === OrderType.LIMIT
            ? formatNormalToWei(slOrderPrice || slTriggerPrice)
            : formatNormalToWei("");
        requestParams.slSalt = slSalt?.toString();
      }

      // Send request
      // Match ts-frontend and Java: use JSON POST request, not form-urlencoded
      // ts-frontend's postForm actually sends JSON with Content-Type: application/json
      const response = await this.httpClient.post<OrderResponse>(
        API_ENDPOINTS.PLACE_ORDER,
        requestParams
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticateForTrading();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.post<OrderResponse>(
            API_ENDPOINTS.PLACE_ORDER,
            requestParams
          );
          this.restoreMainAuth();
          if (retryResponse.code === 200) {
            return {
              status: true,
              data: retryResponse,
            };
          }
        }
        this.restoreMainAuth();
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      this.restoreMainAuth();
      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      } else {
        return {
          status: false,
          error: response.message || "Order failed",
          data: response,
        };
      }
    } catch (error) {
      this.restoreMainAuth();
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Cancel an order
   * @param params Cancel order parameters
   * @returns Cancel order response
   */
  async cancelOrder(params: CancelOrderParams): Promise<SDKResponse<OrderResponse>> {
    try {
      // Use sub-account auth for trading if configured
      const authResult = await this.authenticateForTrading();
      if (!authResult.status) {
        this.restoreMainAuth();
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const { symbol, orderHashes, parentAddress = this.walletAddress } = params;

      if (!orderHashes || orderHashes.length === 0) {
        throw new Error("Order hashes are required");
      }

      // Use sub-account keypair for signing if available
      const signingKeypair = this.subKeypair || this.keypair;

      // Build cancel order message
      const cancelOrderObj = { orderHashes };
      const orderHashBytes = new TextEncoder().encode(JSON.stringify(cancelOrderObj));

      // Sign the message
      const signature = await signMessage(signingKeypair, orderHashBytes);

      // Build request parameters
      // Match ts-frontend and Java: orderHashes should be an array, not a JSON string
      // JSON POST request will automatically serialize the array
      const requestParams = {
        symbol,
        orderHashes, // Direct array, not JSON.stringify
        signature,
        parentAddress,
      };

      // Send request
      // Match ts-frontend and Java: use JSON POST request, not form-urlencoded
      // ts-frontend's postForm actually sends JSON with Content-Type: application/json
      const response = await this.httpClient.post<OrderResponse>(
        API_ENDPOINTS.CANCEL_ORDER,
        requestParams
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticateForTrading();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.post<OrderResponse>(
            API_ENDPOINTS.CANCEL_ORDER,
            requestParams
          );
          this.restoreMainAuth();
          if (retryResponse.code === 200) {
            return {
              status: true,
              data: retryResponse,
            };
          }
        }
        this.restoreMainAuth();
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      this.restoreMainAuth();
      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      } else {
        return {
          status: false,
          error: response.message || "Cancellation Failed",
          data: response,
        };
      }
    } catch (error) {
      this.restoreMainAuth();
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Adjust preferred leverage for a symbol (matches ts-frontend behavior)
   * @param params Adjust leverage parameters
   */
  async adjustLeverage(params: AdjustLeverageParams): Promise<SDKResponse<OrderResponse>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const { symbol, leverage, marginType = "ISOLATED" } = params;

      if (!symbol) {
        throw new Error("Symbol is required for adjusting leverage");
      }

      if (!this.isPositiveNumber(leverage)) {
        throw new Error("Leverage must be greater than zero");
      }

      const payload = {
        symbol,
        marginType,
        leverage: formatNormalToWei(leverage),
      };

      let response = await this.httpClient.post<OrderResponse>(
        API_ENDPOINTS.ADJUST_LEVERAGE,
        payload
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.post<OrderResponse>(
            API_ENDPOINTS.ADJUST_LEVERAGE,
            payload
          );
        } else {
          return {
            status: false,
            error: "Authentication expired and refresh failed",
          };
        }
      }

      if (response.code === 200) {
        return {
          status: true,
          data: response,
        };
      }

      return {
        status: false,
        data: response,
        error: response.message || "Failed to adjust leverage",
      };
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Fetch current user config (preferred leverage & margin type) for a symbol
   * Mirrors ts-frontend behavior: GET /user-config/config + formatWeiToNormal
   * @param symbol Trading symbol, e.g. "BTC-PERP"
   */
  async getUserConfig(symbol: string): Promise<SDKResponse<UserConfig>> {
    if (!symbol) {
      return {
        status: false,
        error: "Symbol is required",
      };
    }

    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params = { symbol };
      let response = await this.httpClient.get<UserConfig>(API_ENDPOINTS.GET_USER_CONFIG, {
        params,
      });

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<UserConfig>(API_ENDPOINTS.GET_USER_CONFIG, {
            params,
          });
        } else {
          return {
            status: false,
            error: "Authentication expired and refresh failed",
          };
        }
      }

      if (response.code === 200 && response.data) {
        const rawConfig: Record<string, any> = Array.isArray(response.data)
          ? response.data[0]
          : response.data;

        if (!rawConfig) {
          return {
            status: false,
            error: "User config not found",
          };
        }

        const leverageWei = rawConfig.leverage ?? rawConfig.leverageWei ?? "0";
        const normalizedConfig: UserConfig = {
          ...rawConfig,
          symbol: rawConfig.symbol || symbol,
          marginType: rawConfig.marginType || rawConfig.marginTypeEnum,
          leverageWei,
          leverage: this.formatWeiToNormal(leverageWei),
        };

        return {
          status: true,
          data: normalizedConfig,
        };
      }

      return {
        status: false,
        error: response.message || "Failed to fetch user config",
      };
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Place or edit TP/SL orders for a position
   */
  async placePositionTpSlOrders(
    params: PlaceTpSlOrdersParams
  ): Promise<SDKResponse<PlaceTpSlOrdersResult>> {
    try {
      const authResult = await this.authenticateForTrading();
      if (!authResult.status) {
        this.restoreMainAuth();
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      // Use sub-account keypair for signing if available
      const signingKeypair = this.subKeypair || this.keypair;

      const {
        symbol,
        market,
        side,
        isLong,
        leverage,
        quantity,
        reduceOnly = true,
        postOnly = false,
        orderbookOnly = true,
        ioc = false,
        tp,
        sl,
      } = params;

      if (!this.isPositiveNumber(quantity)) {
        return {
          status: false,
          error: "Quantity must be greater than zero",
        };
      }

      const hasTpOrder = this.hasTpSlOrderConfig(tp, quantity);
      const hasSlOrder = this.hasTpSlOrderConfig(sl, quantity);

      if (!hasTpOrder && !hasSlOrder) {
        return {
          status: false,
          error: "At least one TP or SL configuration is required",
        };
      }

      const leverageBN = formatNormalToWeiBN(leverage);
      const leverageWei = formatNormalToWei(leverage);
      const expirationBN = new BigNumber(0);
      const saltBN = new BigNumber(+new Date());
      const slSaltBN = saltBN.plus(1);
      const planPayloadBase = {
        symbol,
        side,
        leverage: leverageWei,
        creator: this.walletAddress,
      };

      const sendPlanCloseRequest = async (payload: Record<string, any>) => {
        let response = await this.httpClient.post<OrderResponse>(
          API_ENDPOINTS.PLAN_CLOSE_ORDER,
          payload
        );

        if (response.code === 1000) {
          this.clearAuth();
          const retryAuth = await this.authenticate();
          if (retryAuth.status) {
            response = await this.httpClient.post<OrderResponse>(
              API_ENDPOINTS.PLAN_CLOSE_ORDER,
              payload
            );
          }
        }

        return response;
      };

      const results: PlaceTpSlOrdersResult = {};
      let tpPayload: Record<string, any> | undefined;
      let slPayload: Record<string, any> | undefined;

      if (hasTpOrder && tp) {
        if (!this.isPositiveNumber(tp.triggerPrice)) {
          return {
            status: false,
            error: "TP trigger price must be greater than zero",
          };
        }

        const tpSaltValue = tp.salt ? new BigNumber(tp.salt) : saltBN;
        const tpOrderQuantityBN = formatNormalToWeiBN(tp.quantity ?? quantity);
        const tpOrderPriceBN =
          (tp.orderType || OrderType.MARKET) === OrderType.LIMIT
            ? formatNormalToWeiBN(tp.orderPrice ?? tp.triggerPrice ?? "0")
            : new BigNumber(0);

        const tpOrder = {
          market,
          creator: this.walletAddress,
          isLong,
          reduceOnly,
          postOnly,
          orderbookOnly,
          ioc,
          quantity: tpOrderQuantityBN,
          price: tpOrderPriceBN,
          leverage: leverageBN,
          expiration: expirationBN,
          salt: tpSaltValue,
        };

        const tpOrderMsg = OrderSigner.getOrderMessageForUIWallet(tpOrder);
        const tpOrderSignature = await signMessage(
          signingKeypair,
          new TextEncoder().encode(tpOrderMsg)
        );

        tpPayload = {
          ...planPayloadBase,
          tpOrderType: tp.orderType || OrderType.MARKET,
          tpTpslType: tp.tpslType || ("position" as TpSlMode),
          tpTriggerPrice: formatNormalToWei(tp.triggerPrice),
          tpOrderPrice:
            (tp.orderType || OrderType.MARKET) === OrderType.LIMIT
              ? formatNormalToWei(tp.orderPrice ?? tp.triggerPrice ?? "0")
              : "0",
          tpQuantity: formatNormalToWei(tp.quantity ?? quantity),
          tpTriggerWay: tp.triggerWay || "oracle",
          tpSalt: tpSaltValue.toString(),
          tpOrderSignature,
        };

        if (tp.planId !== undefined) {
          tpPayload.tpPlanId = tp.planId;
        }
      }

      if (hasSlOrder && sl) {
        if (!this.isPositiveNumber(sl.triggerPrice)) {
          return {
            status: false,
            error: "SL trigger price must be greater than zero",
          };
        }

        const slSaltValue = sl.salt ? new BigNumber(sl.salt) : slSaltBN;
        const slOrderQuantityBN = formatNormalToWeiBN(sl.quantity ?? quantity);
        const slOrderPriceBN =
          (sl.orderType || OrderType.MARKET) === OrderType.LIMIT
            ? formatNormalToWeiBN(sl.orderPrice ?? sl.triggerPrice ?? "0")
            : new BigNumber(0);

        const slOrder = {
          market,
          creator: this.walletAddress,
          isLong,
          reduceOnly,
          postOnly,
          orderbookOnly,
          ioc,
          quantity: slOrderQuantityBN,
          price: slOrderPriceBN,
          leverage: leverageBN,
          expiration: expirationBN,
          salt: slSaltValue,
        };

        const slOrderMsg = OrderSigner.getOrderMessageForUIWallet(slOrder);
        const slOrderSignature = await signMessage(
          signingKeypair,
          new TextEncoder().encode(slOrderMsg)
        );

        slPayload = {
          ...planPayloadBase,
          slOrderType: sl.orderType || OrderType.MARKET,
          slTpslType: sl.tpslType || ("position" as TpSlMode),
          slTriggerPrice: formatNormalToWei(sl.triggerPrice),
          slOrderPrice:
            (sl.orderType || OrderType.MARKET) === OrderType.LIMIT
              ? formatNormalToWei(sl.orderPrice ?? sl.triggerPrice ?? "0")
              : "0",
          slQuantity: formatNormalToWei(sl.quantity ?? quantity),
          slTriggerWay: sl.triggerWay || "oracle",
          slSalt: slSaltValue.toString(),
          slOrderSignature,
        };

        if (sl.planId !== undefined) {
          slPayload.slPlanId = sl.planId;
        }
      }

      if (hasTpOrder && hasSlOrder && tpPayload && slPayload) {
        const payload = {
          ...tpPayload,
          ...slPayload,
        };
        const response = await sendPlanCloseRequest(payload);
        results.tpResult = response;
        results.slResult = response;
      } else if (hasTpOrder && tpPayload) {
        results.tpResult = await sendPlanCloseRequest(tpPayload);
      } else if (hasSlOrder && slPayload) {
        results.slResult = await sendPlanCloseRequest(slPayload);
      }

      const success = [results.tpResult, results.slResult].some(
        (res) => res && res.code === 200
      );

      if (success) {
        this.restoreMainAuth();
        return {
          status: true,
          data: results,
        };
      }

      this.restoreMainAuth();
      return {
        status: false,
        data: results,
        error:
          results.tpResult?.message ||
          results.slResult?.message ||
          "Failed to place TP/SL order",
      };
    } catch (error) {
      this.restoreMainAuth();
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get TP/SL orders for a position
   */
  async getPositionTpSl(
    positionId: string | number,
    tpslType: TpSlMode = "normal"
  ): Promise<SDKResponse<PositionTpSlOrder[]>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params = {
        positionId,
        tpslType,
      };

      let response = await this.httpClient.get<PositionTpSlOrder[]>(
        API_ENDPOINTS.GET_POSITION_TPSL,
        { params }
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<PositionTpSlOrder[]>(
            API_ENDPOINTS.GET_POSITION_TPSL,
            { params }
          );
        } else {
          return {
            status: false,
            error: "Authentication expired and refresh failed",
          };
        }
      }

      if (response.code === 200) {
        const rawData = Array.isArray(response.data)
          ? response.data
          : (response.data as any)?.data || [];
        const orders = rawData.map((item: any) =>
          this.transformPositionTpSlOrder(item)
        );
        return {
          status: true,
          data: orders,
        };
      }

      return {
        status: false,
        error: response.message || "Failed to fetch TP/SL orders",
      };
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Cancel TP/SL orders (alias of cancelOrder)
   */
  async cancelTpSlOrders(
    params: CancelTpSlOrdersParams
  ): Promise<SDKResponse<OrderResponse>> {
    return this.cancelOrder(params);
  }

  /**
   * Get account information
   * @returns Account info response
   */
  async getAccountInfo(params?: AccountInfoParams): Promise<SDKResponse<AccountInfo>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const queryParams: Record<string, any> = {};
      if (params?.parentAddress) {
        queryParams.parentAddress = params.parentAddress;
      }

      const response = await this.httpClient.get<AccountInfoResponse>(
        API_ENDPOINTS.GET_ACCOUNT_INFO,
        { params: queryParams }
      );

      // Handle JWT expiration (code 1000)
      if (response.code === 1000) {
        // Clear token and retry authentication
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          // Retry the request
          const retryResponse = await this.httpClient.get<AccountInfoResponse>(
            API_ENDPOINTS.GET_ACCOUNT_INFO,
            { params: queryParams }
          );
          if (retryResponse.code === 200 && retryResponse.data) {
            return {
              status: true,
              data: {
                walletBalance: retryResponse.data.walletBalance || "0",
                totalUnrealizedProfit: retryResponse.data.totalUnrealizedProfit || "0",
                accountValue: retryResponse.data.accountValue || "0",
                freeCollateral: retryResponse.data.freeCollateral || "0",
                totalMargin: retryResponse.data.totalMargin || "0",
              },
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200 && response.data) {
        return {
          status: true,
          data: {
            walletBalance: response.data.walletBalance || "0",
            totalUnrealizedProfit: response.data.totalUnrealizedProfit || "0",
            accountValue: response.data.accountValue || "0",
            freeCollateral: response.data.freeCollateral || "0",
            totalMargin: response.data.totalMargin || "0",
          },
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get account info",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get positions
   * @param symbol Optional symbol filter
   * @returns Positions response
   */
  async getPositions(paramsOrSymbol?: string | PositionsParams): Promise<SDKResponse<Position[]>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params: Record<string, any> = {};
      if (typeof paramsOrSymbol === "string") {
        params.symbol = paramsOrSymbol;
      } else if (paramsOrSymbol) {
        if (paramsOrSymbol.symbol) params.symbol = paramsOrSymbol.symbol;
        if (paramsOrSymbol.parentAddress) params.parentAddress = paramsOrSymbol.parentAddress;
      }

      const response = await this.httpClient.get<PositionsResponse>(API_ENDPOINTS.GET_POSITIONS, {
        params,
      });

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          const retryResponse = await this.httpClient.get<PositionsResponse>(
            API_ENDPOINTS.GET_POSITIONS,
            { params }
          );
          if (retryResponse.code === 200) {
            const positions = Array.isArray(retryResponse.data)
              ? retryResponse.data
              : retryResponse.data?.data || [];
            return {
              status: true,
              data: positions,
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200) {
        const positions = Array.isArray(response.data) ? response.data : response.data?.data || [];
        return {
          status: true,
          data: positions,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get positions",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get trading pairs list
   * This can be used to find the PerpetualID (perpId) for a given symbol
   * @returns Trading pairs response
   */
  async getTradingPairs(): Promise<SDKResponse<TradingPair[]>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const response = await this.httpClient.get<TradingPairsResponse>(
        API_ENDPOINTS.GET_TRADING_PAIRS
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          const retryResponse = await this.httpClient.get<TradingPairsResponse>(
            API_ENDPOINTS.GET_TRADING_PAIRS
          );
          if (retryResponse.code === 200) {
            const pairs = Array.isArray(retryResponse.data)
              ? retryResponse.data
              : retryResponse.data?.data || [];
            return {
              status: true,
              data: pairs,
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200) {
        const pairs = Array.isArray(response.data) ? response.data : response.data?.data || [];
        return {
          status: true,
          data: pairs,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get trading pairs",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get PerpetualID for a given symbol
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns PerpetualID or null if not found
   */
  async getPerpetualID(symbol: string): Promise<string | null> {
    try {
      const pairsResult = await this.getTradingPairs();
      if (pairsResult.status && pairsResult.data) {
        const pair = pairsResult.data.find((p) => p.symbol === symbol);
        return pair?.perpId || null;
      }
      return null;
    } catch (error) {
      console.error("Error getting PerpetualID:", error);
      return null;
    }
  }

  /**
   * Get open orders
   * @param symbol Optional symbol filter
   * @returns Open orders response
   */
  async getOpenOrders(paramsOrSymbol?: string | OpenOrdersParams): Promise<SDKResponse<OpenOrder[]>> {
    try {
      // Ensure authenticated before making request
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return {
          status: false,
          error: authResult.error || "Authentication failed",
        };
      }

      const params: Record<string, any> = {};
      if (typeof paramsOrSymbol === "string") {
        params.symbol = paramsOrSymbol;
      } else if (paramsOrSymbol) {
        if (paramsOrSymbol.symbol) params.symbol = paramsOrSymbol.symbol;
        if (paramsOrSymbol.page) params.page = paramsOrSymbol.page;
        if (paramsOrSymbol.pageSize) params.pageSize = paramsOrSymbol.pageSize;
        if (paramsOrSymbol.parentAddress) params.parentAddress = paramsOrSymbol.parentAddress;
      }

      const response = await this.httpClient.get<OpenOrdersResponse>(
        API_ENDPOINTS.GET_OPEN_ORDERS,
        { params }
      );

      // Handle JWT expiration
      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          const retryResponse = await this.httpClient.get<OpenOrdersResponse>(
            API_ENDPOINTS.GET_OPEN_ORDERS,
            { params }
          );
          if (retryResponse.code === 200) {
            const orders = Array.isArray(retryResponse.data)
              ? retryResponse.data
              : retryResponse.data?.data || [];
            return {
              status: true,
              data: orders,
            };
          }
        }
        return {
          status: false,
          error: "Authentication expired and refresh failed",
        };
      }

      if (response.code === 200) {
        const orders = Array.isArray(response.data) ? response.data : response.data?.data || [];
        return {
          status: true,
          data: orders,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get open orders",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Get order book for a trading pair
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns Order book response with bids and asks
   * @example
   * ```typescript
   * const orderBook = await sdk.getOrderBook("BTC-PERP");
   * if (orderBook.status && orderBook.data) {
   *   console.log("Bids:", orderBook.data.bids);
   *   console.log("Asks:", orderBook.data.asks);
   * }
   * ```
   */
  async getOrderBook(symbol: string): Promise<SDKResponse<OrderBook>> {
    try {
      if (!symbol) {
        return {
          status: false,
          error: "Symbol is required",
        };
      }

      // Market API endpoints typically don't require authentication
      // But we'll try to authenticate if possible for consistency
      // If authentication fails, we'll still try to fetch the order book
      await this.authenticate().catch(() => {
        // Ignore authentication errors for market data
      });

      const params: Record<string, any> = {
        symbol,
      };

      const response = await this.httpClient.get<any>(
        API_ENDPOINTS.GET_ORDER_BOOK,
        { params }
      );

      if (response.code === 200 && response.data) {
        // Extract order book data from response
        // Match Java client: OrderBookResponse has bids and asks as List<List<String>>
        // Format: [[price, quantity, orderNum], ...]
        let rawData = response.data;
        
        // Handle nested response structure
        if ((rawData as any).data) {
          rawData = (rawData as any).data;
        }

        // Validate structure
        if (!rawData || !Array.isArray(rawData.bids) || !Array.isArray(rawData.asks)) {
          return {
            status: false,
            error: "Invalid order book data structure",
          };
        }

        // Process bids and asks from array format to OrderBookEntry format
        // Match ts-frontend: processOrderBookEntries converts [price, quantity, orderNum] to {price, quantity}
        const bids = this.processOrderBookEntries(rawData.bids, "bids");
        const asks = this.processOrderBookEntries(rawData.asks, "asks");

        const orderBook: OrderBook = {
          symbol,
          bids,
          asks,
          timestamp: Date.now(),
        };

        return {
          status: true,
          data: orderBook,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get order book",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Process order book entries from API format to OrderBookEntry format
   * Match ts-frontend: processOrderBookEntries method
   * @param entries Raw entries from API (array of [price, quantity, orderNum] or objects)
   * @param side "bids" or "asks"
   * @returns Processed OrderBookEntry array
   */
  private processOrderBookEntries(
    entries: any[],
    side: "bids" | "asks"
  ): OrderBookEntry[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter((entry) => {
        // Check if it's array format [price, quantity, orderNum]
        if (Array.isArray(entry) && entry.length >= 2) {
          const [price, quantity] = entry;
          return (
            price &&
            quantity &&
            !isNaN(parseFloat(String(price))) &&
            !isNaN(parseFloat(String(quantity))) &&
            parseFloat(String(quantity)) > 0
          );
        }
        // Check if it's object format {price, quantity}
        if (entry && entry.price && entry.quantity) {
          return (
            !isNaN(parseFloat(String(entry.price))) &&
            !isNaN(parseFloat(String(entry.quantity))) &&
            parseFloat(String(entry.quantity)) > 0
          );
        }
        return false;
      })
      .map((entry) => {
        let price: string, quantity: string;

        // Handle array format [price, quantity, orderNum]
        if (Array.isArray(entry) && entry.length >= 2) {
          [price, quantity] = entry;
        } else {
          // Handle object format {price, quantity}
          price = entry.price;
          quantity = entry.quantity;
        }

        // Keep wei format - no conversion
        return {
          price: String(price),
          quantity: String(quantity),
        };
      })
      .sort((a, b) => {
        const priceA = parseFloat(a.price);
        const priceB = parseFloat(b.price);

        // Bids: sort descending (highest price first)
        // Asks: sort ascending (lowest price first)
        // Match ts-frontend: bids descending, asks ascending
        if (side === "bids") {
          return priceB - priceA; // Descending for bids
        } else {
          return priceA - priceB; // Ascending for asks
        }
      });
  }

  /**
   * Format wei value to normal units (18 decimals)
   * Match ts-frontend: formatWeiToNormal function
   * @param value Value in wei (string or number)
   * @param decimals Number of decimals (default 18)
   * @returns Formatted string in normal units
   */
  private formatWeiToNormal(value: number | string, decimals = 18): string {
    try {
      const bn = new BigNumber(value);
      if (bn.isNaN() || bn.isZero()) {
        return "0";
      }
      return bn.dividedBy(new BigNumber(10).pow(decimals)).toString();
    } catch (error) {
      console.error("Error converting wei to normal:", error);
      return "0";
    }
  }

  /**
   * Get ticker information for a trading pair
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns Ticker information response
   * @example
   * ```typescript
   * const ticker = await sdk.getTicker("BTC-PERP");
   * if (ticker.status && ticker.data) {
   *   console.log("Last Price:", ticker.data.lastPrice);
   *   console.log("24h Volume:", ticker.data.volume24h);
   *   console.log("24h Change:", ticker.data.rate24h);
   * }
   * ```
   */
  async getTicker(symbol: string): Promise<SDKResponse<Ticker>> {
    try {
      if (!symbol) {
        return {
          status: false,
          error: "Symbol is required",
        };
      }

      // Market API endpoints typically don't require authentication
      // But we'll try to authenticate if possible for consistency
      // If authentication fails, we'll still try to fetch the ticker
      await this.authenticate().catch(() => {
        // Ignore authentication errors for market data
      });

      const params: Record<string, any> = {
        symbol,
      };

      const response = await this.httpClient.get<any>(
        API_ENDPOINTS.GET_TICKER,
        { params }
      );

      if (response.code === 200 && response.data) {
        // Extract ticker data from response
        // Match Java client: TickerResponse structure
        let rawData = response.data;

        // Handle nested response structure
        if ((rawData as any).data) {
          rawData = (rawData as any).data;
        }

        // Validate structure
        if (!rawData || !rawData.symbol) {
          return {
            status: false,
            error: "Invalid ticker data structure",
          };
        }

        // Process ticker data: convert wei to normal units
        // Match ts-frontend: transformerTicker function
        const ticker = this.processTickerData(rawData);

        return {
          status: true,
          data: ticker,
        };
      } else {
        return {
          status: false,
          error: response.message || "Failed to get ticker",
        };
      }
    } catch (error) {
      return {
        status: false,
        error: formatError(error),
      };
    }
  }

  /**
   * Transform raw TP/SL order data into SDK-friendly format
   */
  private transformPositionTpSlOrder(raw: any): PositionTpSlOrder {
    const toNormal = (value?: string | number | null) =>
      value !== undefined && value !== null && value !== ""
        ? this.formatWeiToNormal(value)
        : undefined;

    const planOrderType = raw.planOrderType;

    return {
      ...raw,
      id: raw.id ?? raw.planId ?? raw.planBatchId,
      planBatchId: raw.planBatchId ?? raw.id,
      planOrderType,
      orderType: raw.orderType,
      symbol: raw.symbol,
      side: raw.side,
      status: raw.status,
      hash: raw.hash,
      quantity: toNormal(raw.quantity) ?? "0",
      price: toNormal(raw.price),
      triggerPrice: toNormal(raw.triggerPrice),
      tpTriggerPrice: toNormal(raw.tpTriggerPrice),
      tpOrderPrice: toNormal(raw.tpOrderPrice),
      slTriggerPrice: toNormal(raw.slTriggerPrice),
      slOrderPrice: toNormal(raw.slOrderPrice),
      tpPlanId:
        planOrderType === "takeProfit"
          ? raw.tpPlanId ?? raw.id ?? null
          : raw.tpPlanId ?? null,
      slPlanId:
        planOrderType === "stopLoss"
          ? raw.slPlanId ?? raw.id ?? null
          : raw.slPlanId ?? null,
      tpslType: raw.tpslType,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Check whether TP/SL config should be submitted
   */
  private hasTpSlOrderConfig(
    config: TpSlOrderConfig | undefined,
    fallbackQuantity: number | string
  ): boolean {
    if (!config) {
      return false;
    }

    if (!this.isPositiveNumber(config.triggerPrice)) {
      return false;
    }

    const quantityValue = config.quantity ?? fallbackQuantity;
    return this.isPositiveNumber(quantityValue);
  }

  /**
   * Determine if a numeric input is greater than zero
   */
  private isPositiveNumber(value?: number | string): boolean {
    if (value === undefined || value === null || value === "") {
      return false;
    }

    try {
      return new BigNumber(value).gt(0);
    } catch {
      return false;
    }
  }

  /**
   * Process ticker data from API format to Ticker format
   * Keep all values in wei format - no conversion
   * @param rawData Raw ticker data from API
   * @returns Processed Ticker object
   */
  private processTickerData(rawData: any): Ticker {
    // Calculate mid price from best bid and ask
    // Calculate using wei values, keep in wei format
    let midPrice: string | undefined;
    if (rawData.bestAskPrice && rawData.bestBidPrice) {
      // Both exist: calculate average in wei
      const askPriceBN = new BigNumber(rawData.bestAskPrice);
      const bidPriceBN = new BigNumber(rawData.bestBidPrice);
      const midPriceBN = askPriceBN.plus(bidPriceBN).dividedBy(2);
      midPrice = midPriceBN.toString();
    } else if (rawData.bestAskPrice) {
      midPrice = String(rawData.bestAskPrice);
    } else if (rawData.bestBidPrice) {
      midPrice = String(rawData.bestBidPrice);
    } else {
      midPrice = "0";
    }

    // Build ticker object - keep all values in wei format
    const ticker: Ticker = {
      symbol: rawData.symbol,
      lastPrice: String(rawData.lastPrice || "0"),
      high24h: String(rawData.high24h || "0"),
      low24h: String(rawData.low24h || "0"),
      amount24h: String(rawData.amount24h || "0"),
      volume24h: String(rawData.volume24h || "0"),
      midPrice,
      timestamp: rawData.timestamp || Date.now(),
    };

    // Optional fields - keep in wei format
    if (rawData.markPrice) {
      ticker.markPrice = String(rawData.markPrice);
    }
    if (rawData.bestAskPrice) {
      ticker.bestAskPrice = String(rawData.bestAskPrice);
    }
    if (rawData.bestBidPrice) {
      ticker.bestBidPrice = String(rawData.bestBidPrice);
    }
    if (rawData.bestAskAmount) {
      ticker.bestAskAmount = String(rawData.bestAskAmount);
    }
    if (rawData.bestBidAmount) {
      ticker.bestBidAmount = String(rawData.bestBidAmount);
    }
    if (rawData.open24h) {
      ticker.open24h = String(rawData.open24h);
    }
    if (rawData.change24h) {
      ticker.change24h = String(rawData.change24h);
    }
    if (rawData.rate24h) {
      ticker.rate24h = String(rawData.rate24h);
    }
    if (rawData.openPrice) {
      ticker.openPrice = String(rawData.openPrice);
    }
    if (rawData.oraclePrice) {
      ticker.oraclePrice = String(rawData.oraclePrice);
    }
    if (rawData.fundingRate) {
      ticker.fundingRate = String(rawData.fundingRate);
    }
    if (rawData.openInterest) {
      ticker.openInterest = String(rawData.openInterest);
    }

    return ticker;
  }

  /**
   * Get history orders (matches Java historyOrders)
   * @param params History orders query parameters
   */
  async getHistoryOrders(params?: HistoryOrdersParams): Promise<SDKResponse<PageResponse<HistoryOrder>>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return { status: false, error: authResult.error || "Authentication failed" };
      }

      const queryParams: Record<string, any> = {};
      if (params?.symbol) queryParams.symbol = params.symbol;
      if (params?.page) queryParams.page = params.page;
      if (params?.pageSize) queryParams.pageSize = params.pageSize;
      if (params?.parentAddress) queryParams.parentAddress = params.parentAddress;

      let response = await this.httpClient.get<PageResponse<HistoryOrder>>(
        API_ENDPOINTS.HISTORY_ORDERS,
        { params: queryParams }
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<PageResponse<HistoryOrder>>(
            API_ENDPOINTS.HISTORY_ORDERS,
            { params: queryParams }
          );
        } else {
          return { status: false, error: "Authentication expired and refresh failed" };
        }
      }

      if (response.code === 200 && response.data) {
        return { status: true, data: response.data };
      }
      return { status: false, error: response.message || "Failed to get history orders" };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Get funding settlements history (matches Java fundingSettlements)
   * @param params Funding settlements query parameters
   */
  async getFundingSettlements(params?: FundingSettlementsParams): Promise<SDKResponse<PageResponse<FundingSettlement>>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return { status: false, error: authResult.error || "Authentication failed" };
      }

      const queryParams: Record<string, any> = {};
      if (params?.symbol) queryParams.symbol = params.symbol;
      if (params?.page) queryParams.page = params.page;
      if (params?.pageSize) queryParams.pageSize = params.pageSize;
      if (params?.parentAddress) queryParams.parentAddress = params.parentAddress;

      let response = await this.httpClient.get<PageResponse<FundingSettlement>>(
        API_ENDPOINTS.FUNDING_SETTLEMENTS,
        { params: queryParams }
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<PageResponse<FundingSettlement>>(
            API_ENDPOINTS.FUNDING_SETTLEMENTS,
            { params: queryParams }
          );
        } else {
          return { status: false, error: "Authentication expired and refresh failed" };
        }
      }

      if (response.code === 200 && response.data) {
        return { status: true, data: response.data };
      }
      return { status: false, error: response.message || "Failed to get funding settlements" };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Get balance changes history (matches Java balanceChanges)
   * @param params Balance changes query parameters
   */
  async getBalanceChanges(params?: BalanceChangesParams): Promise<SDKResponse<PageResponse<BalanceChange>>> {
    try {
      const authResult = await this.authenticate();
      if (!authResult.status) {
        return { status: false, error: authResult.error || "Authentication failed" };
      }

      const queryParams: Record<string, any> = {};
      if (params?.page) queryParams.page = params.page;
      if (params?.pageSize) queryParams.pageSize = params.pageSize;
      if (params?.parentAddress) queryParams.parentAddress = params.parentAddress;

      let response = await this.httpClient.get<PageResponse<BalanceChange>>(
        API_ENDPOINTS.BALANCE_CHANGES,
        { params: queryParams }
      );

      if (response.code === 1000) {
        this.clearAuth();
        const retryAuth = await this.authenticate();
        if (retryAuth.status) {
          response = await this.httpClient.get<PageResponse<BalanceChange>>(
            API_ENDPOINTS.BALANCE_CHANGES,
            { params: queryParams }
          );
        } else {
          return { status: false, error: "Authentication expired and refresh failed" };
        }
      }

      if (response.code === 200 && response.data) {
        return { status: true, data: response.data };
      }
      return { status: false, error: response.message || "Failed to get balance changes" };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Get oracle price for a trading pair (matches Java oracle)
   * @param symbol Trading symbol (e.g., "BTC-PERP")
   * @returns Oracle price as string (in wei/base unit)
   */
  async getOraclePrice(symbol: string): Promise<SDKResponse<string>> {
    try {
      if (!symbol) {
        return { status: false, error: "Symbol is required" };
      }

      await this.authenticate().catch(() => {});

      const response = await this.httpClient.get<any>(
        API_ENDPOINTS.ORACLE,
        { params: { symbol } }
      );

      if (response.code === 200 && response.data !== undefined) {
        return { status: true, data: String(response.data) };
      }
      return { status: false, error: response.message || "Failed to get oracle price" };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Add isolated margin to an existing position (on-chain)
   * @param params Margin adjustment parameters
   */
  async addMargin(params: MarginAdjustmentParams): Promise<SuiTransactionBlockResponse> {
    const transaction = await this.buildMarginTransaction(params, "add");
    if (transaction) {
      return this.exchangeOnChain.executeTxBlock(transaction, this.keypair);
    }
    const fallbackPayload = this.buildMarginCallArgs(params, "add");
    return this.exchangeOnChain.addMargin(fallbackPayload);
  }

  /**
   * Remove isolated margin from an existing position (on-chain)
   * @param params Margin adjustment parameters
   */
  async removeMargin(params: MarginAdjustmentParams): Promise<SuiTransactionBlockResponse> {
    const transaction = await this.buildMarginTransaction(params, "remove");
    if (transaction) {
      return this.exchangeOnChain.executeTxBlock(transaction, this.keypair);
    }
    const fallbackPayload = this.buildMarginCallArgs(params, "remove");
    return this.exchangeOnChain.removeMargin(fallbackPayload);
  }

  /**
   * Build ExchangeOnChain call args for margin adjustments
   */
  private buildMarginCallArgs(
    params: MarginAdjustmentParams,
    action: "add" | "remove"
  ): {
    amount: number;
    account: string;
    perpID?: string;
    market?: string;
    subAccountsMapID?: string;
    gasBudget?: number;
    txHash?: string;
  } {
    const {
      amount,
      accountAddress,
      symbol,
      market,
      perpId,
      subAccountsMapId,
      gasBudget,
      txHash,
    } = params;

    if (!this.isPositiveNumber(amount)) {
      throw new Error(`Amount must be greater than zero to ${action} margin`);
    }

    const amountNumber = new BigNumber(amount).toNumber();
    if (!Number.isFinite(amountNumber)) {
      throw new Error("Amount is too large to represent as a number");
    }

    const marketSymbolInput = market || symbol;
    const marketSymbol = marketSymbolInput ? marketSymbolInput.toUpperCase() : undefined;
    const resolvedPerpId =
      perpId || (marketSymbol ? this.resolvePerpIdFromDeployment(marketSymbol) : undefined);

    if (!marketSymbol && !resolvedPerpId) {
      throw new Error("Either market/symbol or perpId must be provided for margin adjustments");
    }

    return {
      amount: amountNumber,
      account: accountAddress || this.walletAddress,
      market: marketSymbol,
      perpID: resolvedPerpId,
      subAccountsMapID: subAccountsMapId,
      gasBudget,
      txHash,
    };
  }

  private getDeploymentPackageId(): string {
    const packages = this.deploymentConfig?.packages;
    if (!packages || !packages.length) {
      throw new Error("Deployment config missing packages array");
    }
    return packages[packages.length - 1];
  }

  private getDeploymentProtocolConfigId(): string {
    const protocolId = this.deploymentConfig?.objects?.ProtocolConfig?.id;
    if (!protocolId) {
      throw new Error("Deployment config missing ProtocolConfig id");
    }
    return protocolId;
  }

  private async buildMarginTransaction(
    params: MarginAdjustmentParams,
    action: "add" | "remove"
  ): Promise<Transaction | undefined> {
    if (!this.transactionBuilder) {
      return undefined;
    }
    const payload = this.buildMarginCallArgs(params, action);
    const updatePriceTx = payload.market
      ? await this.buildUpdatePriceTransaction(payload.market)
      : undefined;
    const baseTx = updatePriceTx || new Transaction();
    if (action === "add") {
      return this.transactionBuilder.exchange_addMarginTx(payload, baseTx, params.gasBudget);
    }
    return this.transactionBuilder.exchange_removeMarginTx(payload, baseTx, params.gasBudget);
  }

  private async buildUpdatePriceTransaction(symbol: string): Promise<Transaction | undefined> {
    if (!symbol) {
      return undefined;
    }
    try {
      if (this.options.network === "mainnet") {
        return await this.buildMainnetPriceUpdateTransaction(symbol);
      }
      return await this.buildTestnetPriceUpdateTransaction(symbol);
    } catch (error) {
      console.warn(`Failed to build price update transaction for ${symbol}:`, error);
      return undefined;
    }
  }

  private async buildMainnetPriceUpdateTransaction(symbol: string): Promise<Transaction | undefined> {
    const priceInfoObjectId = this.getPriceInfoObjectId(symbol);
    const priceFeedId = await this.resolvePriceFeedId(symbol);
    if (!priceInfoObjectId || !priceFeedId) {
      return undefined;
    }

    this.ensurePythClients();
    if (!this.priceServiceConnection || !this.pythClient) {
      return undefined;
    }

    const tx = new Transaction();
    const priceIds = [priceFeedId];
    const priceUpdateData = await this.priceServiceConnection.getPriceFeedsUpdateData(priceIds);

    const [priceInfoObject, clockObject] = await this.suiClient.multiGetObjects({
      ids: [priceInfoObjectId, "0x6"],
      options: { showContent: true, showBcs: true, showType: true },
    });

    const oracleTime = this.extractOracleArrivalTime(priceInfoObject);
    const clockTime = this.extractClockTimeSeconds(clockObject);

    if (clockTime - oracleTime > 5) {
      await this.pythClient.updatePriceFeeds(tx, priceUpdateData, priceIds);
    }

    return tx;
  }

  private async buildTestnetPriceUpdateTransaction(
    symbol: string
  ): Promise<Transaction | undefined> {
    try {
      const oraclePrice = await this.exchangeOnChain.getOraclePrice(symbol);
      if (oraclePrice === undefined || oraclePrice === null) {
        return undefined;
      }
      return this.transactionBuilder.price_info_setOraclePriceTx({
        price: Number(oraclePrice),
        market: symbol,
      });
    } catch (error) {
      console.warn(`Failed to fetch oracle price for ${symbol}:`, error);
      return undefined;
    }
  }

  private getPriceInfoObjectId(symbol: string): string | undefined {
    const canonical = symbol?.toUpperCase();
    const market = this.getDeploymentMarket(canonical);
    return market?.Objects?.PriceInfoObject?.id;
  }

  private getDeploymentMarket(symbol?: string): any {
    if (!symbol) {
      return undefined;
    }
    const markets = this.deploymentConfig?.markets;
    const canonical = symbol.toUpperCase();
    return markets?.[canonical] || markets?.[symbol];
  }

  private async resolvePriceFeedId(symbol: string): Promise<string | undefined> {
    const canonical = symbol?.toUpperCase();
    const deploymentMarket = this.getDeploymentMarket(canonical);
    const configFeed =
      deploymentMarket?.Config?.priceInfoFeedId || deploymentMarket?.Config?.priceIdentifierId;
    if (configFeed) {
      return configFeed;
    }

    const pairs = await this.getCachedTradingPairs();
    const match = pairs.find(
      (pair) => pair.symbol?.toUpperCase() === canonical || pair.symbol === symbol
    );
    if (match) {
      return (match as any).priceIdentifierId || (match as any).priceInfoFeedId;
    }
    return undefined;
  }

  private async getCachedTradingPairs(): Promise<TradingPair[]> {
    const cacheAge = this.tradingPairsCacheTimestamp
      ? Date.now() - this.tradingPairsCacheTimestamp
      : Infinity;
    if (this.tradingPairsCache && cacheAge < 60_000) {
      return this.tradingPairsCache;
    }

    const result = await this.getTradingPairs();
    if (result.status && result.data) {
      this.tradingPairsCache = result.data;
      this.tradingPairsCacheTimestamp = Date.now();
      return result.data;
    }

    return this.tradingPairsCache || [];
  }

  private ensurePythClients(): void {
    const config = PYTH_CONFIG[this.options.network];
    if (!config) {
      return;
    }

    if (!this.priceServiceConnection) {
      this.priceServiceConnection = new SuiPriceServiceConnection(config.priceServiceUrl);
    }

    if (!this.pythClient) {
      this.pythClient = new SuiPythClient(
        this.suiClient as any,
        config.pythStateId,
        config.wormholeStateId
      );
    }
  }

  private extractOracleArrivalTime(objectResponse: any): number {
    const priceInfo =
      objectResponse?.data?.content &&
      "fields" in objectResponse.data.content &&
      (objectResponse.data.content as any).fields?.price_info?.fields?.arrival_time;
    if (typeof priceInfo === "number") {
      return priceInfo;
    }
    if (typeof priceInfo === "string") {
      const parsed = Number(priceInfo);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private extractClockTimeSeconds(objectResponse: any): number {
    const timestamp =
      objectResponse?.data?.content &&
      "fields" in objectResponse.data.content &&
      (objectResponse.data.content as any).fields?.timestamp_ms;
    if (typeof timestamp === "number") {
      return timestamp / 1000;
    }
    if (typeof timestamp === "string") {
      const parsed = Number(timestamp);
      return Number.isFinite(parsed) ? parsed / 1000 : 0;
    }
    return 0;
  }

  /**
   * Resolve perpId from deployment data
   */
  private resolvePerpIdFromDeployment(market: string): string | undefined {
    try {
      const perpId = this.exchangeOnChain.getPerpetualID(market);
      return perpId || undefined;
    } catch (error) {
      console.warn(`Failed to resolve PerpetualID for market ${market}:`, error);
      return undefined;
    }
  }

  /**
   * Set sub-account on-chain (authorize a sub-account address)
   * @param subAddress Sub-account address to authorize
   * @returns On-chain transaction result
   */
  async setSubAccount(subAddress: string) {
    return await this.exchangeOnChain.setSubAccount(
      {
        account: subAddress,
        status: true,
      },
      this.keypair
    );
  }

  /**
   * Deposit to bank (fund account)
   * Deposit USDC from wallet to exchange bank account for trading collateral
   * @param amount Deposit amount in USDC (standard units, e.g., 10 means 10 USDC)
   * @returns On-chain transaction result
   * @example
   * ```typescript
   * const result = await sdk.depositToBank(100); // Deposit 100 USDC
   * ```
   */
  async depositToBank(amount: number) {
    return await this.exchangeOnChain.depositToBank(
      {
        amount: formatNormalToWei(amount, DECIMALS.USDC),
        accountAddress: this.address,
      },
      this.keypair
    );
  }

  /**
   * Withdraw from bank (withdraw funds)
   * Withdraw USDC from exchange bank account back to wallet
   * @param amount Withdraw amount in USDC (standard units, e.g., 50 means 50 USDC)
   * @returns On-chain transaction result
   * @example
   * ```typescript
   * const result = await sdk.withdrawFromBank(50); // Withdraw 50 USDC
   * ```
   */
  async withdrawFromBank(amount: number) {
    return await this.exchangeOnChain.withdrawFromBank(
      {
        amount: formatNormalToWei(amount, DECIMALS.USDC),
        accountAddress: this.address,
      },
      this.keypair
    );
  }

  /**
   * Get all coin balances on-chain for the current wallet address
   * @returns Array of coin balances with coinType and totalBalance
   */
  async getAllBalances(): Promise<SDKResponse<{ coinType: string; totalBalance: string }[]>> {
    try {
      const balances = await this.suiClient.getAllBalances({ owner: this.walletAddress });
      return { status: true, data: balances };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }

  /**
   * Get coin metadata (symbol, decimals, name) for a given coin type
   * @param coinType Full coin type string (e.g., "0x2::sui::SUI")
   */
  async getCoinMetadata(coinType: string): Promise<SDKResponse<{ decimals: number; symbol: string; name: string }>> {
    try {
      const metadata = await this.suiClient.getCoinMetadata({ coinType });
      if (!metadata) {
        return { status: false, error: "Coin metadata not found" };
      }
      return { status: true, data: { decimals: metadata.decimals, symbol: metadata.symbol, name: metadata.name } };
    } catch (error) {
      return { status: false, error: formatError(error) };
    }
  }
}
