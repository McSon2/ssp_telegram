require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const bodyParser = require("body-parser");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const WebSocket = require("ws"); // Pour le serveur WebSocket

const app = express();
app.use(bodyParser.json());

const token = process.env.BOT_TOKEN;
const url = process.env.APP_URL;

const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION; // Chaîne de session pré-générée

let telegramClient;
let telegramInitialized = false;

const bot = new TelegramBot(token);

// Configuration du webhook avec gestion d'erreur
async function setupWebhook() {
  try {
    const webhookInfo = await bot.getWebHookInfo();
    console.log("Webhook actuel:", webhookInfo);
    if (webhookInfo.url !== `${url}/bot${token}`) {
      await bot.setWebHook(`${url}/bot${token}`);
      console.log("Webhook configuré avec succès:", `${url}/bot${token}`);
    } else {
      console.log("Webhook déjà correctement configuré");
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

// Serveur WebSocket
const wss = new WebSocket.Server({ noServer: true });
const connectedClients = new Set();

wss.on("connection", (ws) => {
  console.log("Nouvelle connexion WebSocket");
  connectedClients.add(ws);

  ws.on("close", () => {
    console.log("Connexion WebSocket fermée");
    connectedClients.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});

server.on("upgrade", (request, socket, head) => {
  const pathname = request.url;

  if (pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Initialiser Telegram et écouter le canal
const channelUsername = "@NOM_DU_CANAL"; // Remplacez par le nom d'utilisateur du canal que vous souhaitez écouter

initializeTelegram().then(() => {
  listenToChannel(channelUsername);
});

// Fonction pour initialiser la connexion Telegram
async function initializeTelegram() {
  console.log("Initialisation de Telegram...");
  telegramClient = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    {
      connectionRetries: 5,
    }
  );
  try {
    await telegramClient.connect();
    console.log("Vous êtes connecté à Telegram avec la session pré-générée.");
    telegramInitialized = true;
  } catch (error) {
    console.error("Erreur lors de la connexion à Telegram :", error);
    telegramInitialized = false;
  }
}

// Fonction pour écouter les messages du canal spécifié
async function listenToChannel(channelUsername) {
  if (!telegramInitialized) {
    await initializeTelegram();
  }

  if (!telegramInitialized) {
    console.error("Impossible d'initialiser Telegram. Vérifiez votre session.");
    return;
  }

  console.log(`Écoute des messages du canal : ${channelUsername}`);

  const { NewMessage } = require("telegram/events");

  telegramClient.addEventHandler(async (event) => {
    const message = event.message;
    if (message && message.peerId) {
      const sender = await telegramClient.getEntity(message.peerId);
      if (sender.username === channelUsername.replace("@", "")) {
        const messageText = message.message;
        console.log(
          `Nouveau message reçu du canal ${channelUsername}: ${messageText}`
        );

        // Envoyer le message aux clients WebSocket
        const messageData = {
          text: messageText,
          from: sender,
          date: message.date,
        };

        connectedClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(messageData));
          }
        });
      }
    }
  }, new NewMessage({}));
}

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
