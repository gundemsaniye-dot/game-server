const command = process.argv.slice(2).join(" ") || "TMJ mutation command";

console.error("\n============================================================");
console.error(`[TMJ KILIDI] DURDURULDU: ${command}`);
console.error("Bu komut kaynak .tmj dosyalarını kod tablosuyla yeniden yazabildiği için kilitlendi.");
console.error("Harita değişiklikleri yalnız Tiled içinde, kullanıcı bilgisi ve onayıyla yapılmalıdır.");
console.error("Normal aktarım için yalnız `npm run web:sync` kullanın.");
console.error("============================================================\n");
process.exit(1);
