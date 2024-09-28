require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const token = process.env.BOT_TOKEN;
const url = process.env.APP_URL;

const bot = new TelegramBot(token);

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
  console.log("Mise à jour reçue:", JSON.stringify(req.body));
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Map pour stocker les associations code -> chatId
const userCodes = new Map();
// Map pour suivre l'état de la conversation de chaque utilisateur
const userStates = new Map();

// Gestion de la commande /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`Commande /start reçue du chat ID: ${chatId}`);
  userStates.set(chatId, "WAITING_FOR_CODE");
  bot
    .sendMessage(
      chatId,
      "Bienvenue ! Veuillez entrer le code à 6 chiffres généré par l'application."
    )
    .then(() =>
      console.log(`Message de bienvenue envoyé au chat ID: ${chatId}`)
    )
    .catch((error) =>
      console.error("Erreur lors de l'envoi du message de bienvenue:", error)
    );
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;
  console.log(`Message reçu du chat ID ${chatId}: ${messageText}`);

  if (messageText === "/start") {
    console.log("Commande /start ignorée car déjà gérée");
    return;
  }

  const userState = userStates.get(chatId);
  console.log(`État actuel de l'utilisateur ${chatId}: ${userState}`);

  if (userState === "WAITING_FOR_CODE") {
    if (messageText && messageText.length === 6 && /^\d+$/.test(messageText)) {
      userCodes.set(messageText, chatId);
      userStates.set(chatId, "CODE_VALIDATED");
      bot
        .sendMessage(
          chatId,
          "Code validé ! Vous recevrez maintenant des notifications."
        )
        .then(() => console.log(`Code validé pour le chat ID: ${chatId}`))
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
        .then(() =>
          console.log(`Message d'erreur envoyé au chat ID: ${chatId}`)
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
      .then(() => console.log(`Instructions envoyées au chat ID: ${chatId}`))
      .catch((error) =>
        console.error(
          "Erreur lors de l'envoi du message d'instructions:",
          error
        )
      );
  }
});

app.post("/send-notification", (req, res) => {
  const { code, message } = req.body;
  console.log(
    `Tentative d'envoi de notification. Code: ${code}, Message: ${message}`
  );

  if (userCodes.has(code)) {
    const chatId = userCodes.get(code);
    bot
      .sendMessage(chatId, message)
      .then(() => {
        console.log(`Notification envoyée avec succès au chat ID: ${chatId}`);
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
