require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const bodyParser = require("body-parser");
const Redis = require("ioredis");
const httpProxy = require("http-proxy");

const app = express();
app.use(bodyParser.json());

const token = process.env.BOT_TOKEN;
const url = process.env.APP_URL;

const bot = new TelegramBot(token);

// Configuration du client Redis
const redis = new Redis(process.env.REDIS_URL + "?family=0");

// Configuration du webhook avec gestion d'erreur
async function setupWebhook() {
  try {
    const webhookInfo = await bot.getWebHookInfo();
    if (webhookInfo.url !== `${url}/bot${token}`) {
      await bot.setWebHook(`${url}/bot${token}`);
    }
  } catch (error) {
    console.error("Erreur lors de la configuration du webhook:", error);
  }
}

setupWebhook();

// Gestion des mises à jour via webhook
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Gestion de la commande /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await redis.set(`userState:${chatId}`, "WAITING_FOR_CODE");
  bot
    .sendMessage(
      chatId,
      "Bienvenue ! Veuillez entrer le code à 6 chiffres généré par l'application."
    )
    .catch((error) =>
      console.error("Erreur lors de l'envoi du message de bienvenue:", error)
    );
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  if (messageText === "/start") {
    return;
  }

  const userState = await redis.get(`userState:${chatId}`);

  if (userState === "WAITING_FOR_CODE") {
    if (messageText && messageText.length === 6 && /^\d+$/.test(messageText)) {
      // Vérifier si un code précédent est associé à ce chatId
      const oldCode = await redis.get(`chatId:${chatId}`);
      if (oldCode) {
        // Supprimer l'ancien code
        await redis.del(`code:${oldCode}`);
      }

      // Enregistrer le nouveau code
      await redis.set(`code:${messageText}`, chatId);
      await redis.set(`chatId:${chatId}`, messageText);
      await redis.set(`userState:${chatId}`, "CODE_VALIDATED");

      bot
        .sendMessage(
          chatId,
          "Code validé ! Vous recevrez maintenant des notifications."
        )
        .catch((error) =>
          console.error(
            "Erreur lors de l'envoi du message de validation:",
            error
          )
        );
    } else {
      bot
        .sendMessage(
          chatId,
          "Le code doit être composé de 6 chiffres. Veuillez réessayer."
        )
        .catch((error) =>
          console.error("Erreur lors de l'envoi du message d'erreur:", error)
        );
    }
  } else {
    bot
      .sendMessage(
        chatId,
        "Pour commencer, veuillez utiliser la commande /start."
      )
      .catch((error) =>
        console.error(
          "Erreur lors de l'envoi du message d'instructions:",
          error
        )
      );
  }
});

app.post("/send-notification", async (req, res) => {
  const { code, message } = req.body;

  const chatId = await redis.get(`code:${code}`);
  if (chatId) {
    bot
      .sendMessage(chatId, message)
      .then(() => {
        res.status(200).send("Notification envoyée avec succès");
      })
      .catch((error) => {
        console.error("Erreur lors de l'envoi de la notification:", error);
        res.status(500).send("Erreur lors de l'envoi de la notification");
      });
  } else {
    console.log(`Code non trouvé: ${code}`);
    res.status(404).send("Code non trouvé");
  }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});

// Créer un proxy pour transférer les connexions WebSocket
const proxy = httpProxy.createProxyServer({
  target: "wss://sspcodeclaim-production.up.railway.app",
  ws: true,
  changeOrigin: true,
});

// Gérer les connexions WebSocket entrantes
server.on("upgrade", function (req, socket, head) {
  if (req.url === "/ws") {
    proxy.ws(req, socket, head);
  } else {
    socket.destroy();
  }
});

// Gestion globale des erreurs non gérées
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Gestion des erreurs pour Express
app.use((err, req, res, next) => {
  console.error("Erreur Express:", err.stack);
  res.status(500).send("Something broke!");
});

// Vérification périodique du webhook
setInterval(setupWebhook, 1000 * 60 * 60);
