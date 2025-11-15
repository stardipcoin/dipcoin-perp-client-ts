# 示例文件说明

本目录包含 DipCoin Perpetual Trading SDK 的使用示例。

## 文件列表

### basic-usage.ts

基础使用示例，演示 SDK 的核心功能：

- ✅ 初始化 SDK
- ✅ 认证（Onboarding）
- ✅ 查询账户信息
- ✅ 查询仓位
- ✅ 查询挂单
- ✅ 获取交易对列表
- ✅ 下单（Market Order）
- ✅ 撤单

### limit-order.ts

限价单示例，演示如何下 LIMIT 订单：

- ✅ 初始化 SDK
- ✅ 认证（Onboarding）
- ✅ 获取交易对和 PerpetualID
- ✅ 查询账户信息
- ✅ 下 LIMIT 订单（需要指定价格）
- ✅ 查询挂单

## 运行示例

### 前置条件

1. 安装项目依赖：
   ```bash
   npm install
   ```

2. 配置环境变量：
   ```bash
   # 复制示例文件
   cp .env.example .env
   
   # 编辑 .env 文件，填入你的私钥
   # PRIVATE_KEY=your-private-key-here
   ```

### 运行方法

```bash
# 运行基础示例（Market Order）
npm run example

# 运行限价单示例
npm run example:limit

# 或直接使用 tsx
tsx examples/basic-usage.ts
tsx examples/limit-order.ts
```

## 示例说明

### 1. 初始化 SDK

```typescript
const sdk = initDipCoinPerpSDK(privateKey, {
  network: "testnet", // 或 "mainnet"
});
```

### 2. 查询账户信息

```typescript
const accountInfo = await sdk.getAccountInfo();
if (accountInfo.status) {
  console.log("账户余额:", accountInfo.data?.walletBalance);
}
```

### 3. 查询仓位

```typescript
const positions = await sdk.getPositions();
if (positions.status) {
  positions.data?.forEach(pos => {
    console.log(`${pos.symbol}: ${pos.side} ${pos.quantity}`);
  });
}
```

### 4. 查询挂单

```typescript
const orders = await sdk.getOpenOrders();
if (orders.status) {
  orders.data?.forEach(order => {
    console.log(`${order.symbol}: ${order.side} ${order.quantity} @ ${order.price}`);
  });
}
```

### 5. 下单

#### Market Order（市价单）

```typescript
// 首先获取 PerpetualID
const perpId = await sdk.getPerpetualID("BTC-PERP");

const result = await sdk.placeOrder({
  symbol: "BTC-PERP",
  market: perpId, // REQUIRED: PerpetualID
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: "0.01", // 小数量测试
  leverage: "10",
});
```

#### Limit Order（限价单）

```typescript
// 首先获取 PerpetualID
const perpId = await sdk.getPerpetualID("BTC-PERP");

const result = await sdk.placeOrder({
  symbol: "BTC-PERP",
  market: perpId, // REQUIRED: PerpetualID
  side: OrderSide.BUY,
  orderType: OrderType.LIMIT,
  price: "50000", // REQUIRED for LIMIT orders
  quantity: "0.01",
  leverage: "10",
});
```

### 6. 撤单（需要手动启用）

取消代码注释后可以测试撤单：

```typescript
const cancelResult = await sdk.cancelOrder({
  symbol: "BTC-PERP",
  orderHashes: [orderHash],
});
```

## 注意事项

1. **私钥安全**：永远不要将私钥提交到 Git 或公开代码
2. **测试环境**：建议先在测试网（testnet）上测试
3. **小数量测试**：下单时使用小数量进行测试
4. **错误处理**：所有操作都应该检查返回的 `status` 字段

## 更多示例

更多使用示例请参考项目根目录的 `README.md` 和 `USAGE.md`。

