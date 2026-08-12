export function requireTmjMutationApproval(command) {
  if (process.env.ALLOW_TMJ_SOURCE_MUTATION === "1") return;
  console.error("\n[TMJ KILIDI] Kaynak .tmj yazma girişimi engellendi.");
  console.error(`Komut: ${command}`);
  console.error("Harita değişikliklerini kullanıcıya bildirin ve Tiled içinde yapın.");
  console.error("Bu bakım aracının bilinçli kullanımı ayrıca ALLOW_TMJ_SOURCE_MUTATION=1 gerektirir.\n");
  process.exit(1);
}
