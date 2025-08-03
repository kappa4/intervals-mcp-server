/**
 * Test Deno KV expireIn functionality with the latest Deno version
 */

async function testDenoKVExpire() {
  console.log("🧪 Testing Deno KV expireIn functionality...\n");
  console.log(`Deno version: ${Deno.version.deno}`);
  console.log(`V8 version: ${Deno.version.v8}`);
  console.log(`TypeScript version: ${Deno.version.typescript}\n`);
  
  const kv = await Deno.openKv();
  
  try {
    // Test 1: Set with expireIn
    console.log("1️⃣ Setting value with 3 second expireIn...");
    const key = ["test", "expire", Date.now()];
    const value = { data: "test", timestamp: new Date().toISOString() };
    
    await kv.set(key, value, { expireIn: 3000 });
    console.log("   ✅ Set successful");
    
    // Test 2: Immediate get
    const result1 = await kv.get(key);
    console.log(`   ✅ Immediate get: ${result1.value ? "Found" : "Not found"}`);
    
    // Test 3: Wait and check
    console.log("\n2️⃣ Waiting 4 seconds...");
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    const result2 = await kv.get(key);
    console.log(`   Result after expiry: ${result2.value ? "❌ Still exists (expireIn not working)" : "✅ Expired correctly"}`);
    
    // Test 4: Atomic operation with expireIn
    console.log("\n3️⃣ Testing atomic operation with expireIn...");
    const atomicKey = ["test", "atomic", Date.now()];
    await kv.atomic()
      .set(atomicKey, { atomic: true }, { expireIn: 2000 })
      .commit();
    
    const atomicResult1 = await kv.get(atomicKey);
    console.log(`   ✅ Atomic set: ${atomicResult1.value ? "Found" : "Not found"}`);
    
    await new Promise(resolve => setTimeout(resolve, 2500));
    const atomicResult2 = await kv.get(atomicKey);
    console.log(`   After expiry: ${atomicResult2.value ? "❌ Still exists" : "✅ Expired correctly"}`);
    
    // Summary
    console.log("\n📊 Summary:");
    if (!result2.value && !atomicResult2.value) {
      console.log("   ✅ expireIn is working correctly in this environment!");
    } else {
      console.log("   ❌ expireIn is NOT working as expected");
      console.log("   💡 Manual TTL management is required");
    }
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    kv.close();
  }
}

if (import.meta.main) {
  await testDenoKVExpire();
}