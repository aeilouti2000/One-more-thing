import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = configureApp(app);
  // Lets queued notifications go out before a deploy or restart stops the process.
  app.enableShutdownHooks();
  const port = config.get("PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
