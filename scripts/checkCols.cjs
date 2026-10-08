const https = require("https");

const OAUTH_TOKEN = "sbp_oauth_bf19fbfb29739ab8f0281ac130b7cc7a72b6d45d";
const PROJECT_REF = "qbnmtimnurbciuzqtlxd";

function querySupabase(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OAUTH_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, res => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.message && parsed.message.includes("ERROR")) {
            return reject(new Error(parsed.message));
          }
          resolve(parsed);
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function checkCols() {
  const cols = await querySupabase(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'erp' AND table_name = 'sales_order_receipts';
  `);
  console.log("Colunas em erp.sales_order_receipts:", cols);

  const colsTxPayments = await querySupabase(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'erp' AND table_name = 'transaction_payments';
  `);
  console.log("Colunas em erp.transaction_payments:", colsTxPayments);
}

checkCols().catch(console.error);
