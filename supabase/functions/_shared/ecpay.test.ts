import {
  createEcpayCheckMacValue,
  createMerchantTradeNo,
  ecpayUrlEncode,
  verifyEcpayCheckMacValue,
} from "./ecpay.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`Expected ${b}, received ${a}`);
}

Deno.test("ECPay CheckMacValue matches the official AioCheckOut example", async () => {
  const params = {
    TradeDesc: "促銷方案",
    PaymentType: "aio",
    MerchantTradeDate: "2023/03/12 15:30:23",
    MerchantTradeNo: "ecpay20230312153023",
    MerchantID: "3002607",
    ReturnURL: "https://www.ecpay.com.tw/receive.php",
    ItemName: "Apple iphone 15",
    TotalAmount: 30000,
    ChoosePayment: "ALL",
    EncryptType: 1,
  };
  assertEquals(
    await createEcpayCheckMacValue(
      params,
      "pwFHCqoQZGmho4w6",
      "EkRm7iFT261dpevs",
    ),
    "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840",
  );
});

Deno.test("ECPay URL encoding follows the documented .NET-compatible table", () => {
  assertEquals(
    ecpayUrlEncode("-_.!~*() '"),
    "-_.!%7E*()+%27",
  );
});

Deno.test("ECPay CheckMacValue verification excludes the supplied CheckMacValue field", async () => {
  const params = {
    MerchantID: "3002607",
    MerchantTradeNo: "ORDER123",
    TotalAmount: 2880,
    RtnCode: 1,
  };
  const mac = await createEcpayCheckMacValue(
    params,
    "pwFHCqoQZGmho4w6",
    "EkRm7iFT261dpevs",
  );
  assertEquals(
    await verifyEcpayCheckMacValue(
      { ...params, CheckMacValue: mac },
      mac.toLowerCase(),
      "pwFHCqoQZGmho4w6",
      "EkRm7iFT261dpevs",
    ),
    true,
  );
  assertEquals(
    await verifyEcpayCheckMacValue(
      params,
      "0".repeat(64),
      "pwFHCqoQZGmho4w6",
      "EkRm7iFT261dpevs",
    ),
    false,
  );
});

Deno.test("merchant trade number is ASCII, unique-shaped, and within ECPay's 20-char limit", () => {
  const value = createMerchantTradeNo(
    new Date("2026-09-22T00:15:30.000Z"),
    new Uint8Array([0x12, 0x34, 0xab, 0xcd]),
  );
  if (!/^[A-Za-z0-9]{1,20}$/.test(value)) throw new Error(value);
  assertEquals(value.length, 20);
});
