/* global Util, Nimiq */
// eslint-disable-next-line multiline-comment-style
// import Semaphore from "./Semaphore.js";
// import Util from "./Util.js";

/* DOM Access */
const LOGREG = document.getElementById("logreg"),
	USER_input = document.getElementById("user"),
	TOKEN_input = document.getElementById("token"),
	LOGIN_btn = document.getElementById("login"),
	REGISTER_btn = document.getElementById("register"),
	LOGOUT_btn = document.getElementById("logout"),
	DOWNLOAD_btn = document.getElementById("download"),
	CREDITS = document.getElementById("credits"),
	RADIO_station = document.getElementById("station_name"),
	RADIO_play = document.getElementById("radio_play"),
	RADIO_pause = document.getElementById("radio_pause"),
	RADIO_previous = document.getElementById("radio_previous"),
	RADIO_next = document.getElementById("radio_next"),
	GRID = document.getElementById("grid"),
	GRID_ctx = GRID.getContext("2d"),
	MAPWRAP = document.getElementById("map_container"),
	MAP = document.getElementById("map"),
	MAP_ctx = MAP.getContext("2d"),
	TOOLTIPS = document.getElementById("tooltips"),
	TOOLTIPS_ctx = TOOLTIPS.getContext("2d"),
	MAPTABS = document.getElementById("map_tabs"),
	AU = document.getElementById("AU"),
	SHIPLIST = document.getElementById("shiplist"),
	SHIP_FILTER = document.getElementById("ship_classes"),
	// UNFINISHED = document.getElementById("unfinished_tasklist"),
	FLEET = document.getElementById("fleet"),
	LOANS = document.getElementById("loans"),
	OUTSTANDING = document.getElementById("outstanding"),
	THREADS_input = document.getElementById("threads"),
	TICKMARKS = document.getElementById("tickmarks"),
	MINE_btn = document.getElementById("mineToggle"),
	QR_img = document.querySelector("[data-qr]"),
	BODIES = {
		"ASTEROID": null,
		"GAS_GIANT": null,
		"MOON": null,
		"NEBULA": null,
		"PLANET": null,
		"WORMHOLE": null
	};

// Load map images ASAP
for (const body in BODIES) {
	BODIES[body] = new Image();
	BODIES[body].src = `img/bodies/${body}.svg`;
}

/* Navigation */
const updatePage = event => {
	if (!location.hash) return;
	const hash = location.hash.slice(1);
	if (hash.length) {
		if (hash === "none") {
			// Hides page, defaulting to the home page
			document.getElementById(event.oldURL.split("#")[1]).style.display = "none";
			location.hash = "";
			return;
		}
		document.getElementById(hash).style.display = "block";
		if (event?.oldURL?.match(/#\w/)) document.getElementById(event.oldURL.split("#")[1]).style.display = "none";
	}
};
self.addEventListener("hashchange", updatePage);

/* CONFIG */
// Load settings without polluting the global namespace
const loadSettings = input => {
	const storage = JSON.parse(input);
	// Default settings
	return {
		"API": {
			"queue": [], // Task queue
			"running": [] // Unfinished tasks from last session
		},
		"baseURL": "https://api.spacetraders.io",
		"dirty": {
			"tooltip": false
		},
		"map": {
			"dragging": false,
			"offset": {
				"x": storage?.map?.offset?.x ?? 0,
				"y": storage?.map?.offset?.y ?? 0
			},
			"scale": 0,
			"startX": 0,
			"startY": 0,
			"zoom": storage?.map?.zoom ?? 1
		},
		"miner": {
			"id": storage?.miner?.id ?? null // Generate a unique identifier for this user
		},
		"radio": {
			"currentServer": 0, // Current radio server
			"currentStation": storage?.radio?.currentStation ?? 0, // Current radio station
			"servers": [], // Available radio servers to upvote stations to
			"stations": storage?.radio?.stations ?? [
				// Soma FM Deep Space One - Ambient space music
				{
					"id": "963cf3ba-0601-11e8-ae97-52543be04c81",
					"name": "Soma FM Deep Space One",
					"url": "https://ice1.somafm.com/deepspaceone-128-aac"
				},
				// Soma FM Space Station - Energetic space-like and electronic music
				{
					"id": "960d3f6f-0601-11e8-ae97-52543be04c81",
					"name": "Soma FM Space Station",
					"url": "https://ice1.somafm.com/spacestation-128-aac"
				}
			],
			"status": "paused" // Playing, paused, etc.
		},
		"systems": storage?.systems ?? [],
		"user": {
			"loans": storage?.user?.loans ?? [],
			"ships": storage?.user?.ships ?? [],
			"credits": storage?.user?.credits ?? null,
			"system": storage?.user?.system ?? null, // Symbol of current system
			"token": storage?.user?.token ?? null, // Player API access token, must be protected like a password as it can only be created once
			"username": storage?.user?.username ?? null
		}
	};
};
let settings = loadSettings(localStorage.getItem("STA-Serenity"));

const saveSettingsToFile = () => {
	// Copy settings
	const _settings = { ...settings };
	// Remove data we don't need to save
	delete _settings.baseURL;
	delete _settings.dirty;
	delete _settings.map.dragging;
	delete _settings.map.scale;
	delete _settings.map.startX;
	delete _settings.map.startY;
	delete _settings.radio.currentServer;
	delete _settings.radio.servers;
	delete _settings.radio.status;
	delete _settings.systems;
	delete _settings.user.system;
	// Initiate file save dialog
	Util.saveToFile(_settings);
};

const logout = () => {
	settings.API.queue = [];
	settings.API.running = [];
	settings.systems = [];
	settings.user.credits = null;
	settings.user.loans = [];
	settings.user.ships = [];
	settings.user.system = null;
	settings.user.token = null;
	settings.user.username = null;
	Util.saveToStorage(settings);
	// Hide map
	MAPWRAP.style.visibility = "hidden";
	// Show home screen
	location.hash = "#none";
	launch();
};

// Load settings file after player drops it into window
document.addEventListener("dragover", event => event.preventDefault());
document.addEventListener("drop", event => {
	event.preventDefault();
	event.dataTransfer.items[0].getAsFile().text().then(data => {
		// Load settings from file and save into localStorage
		settings = loadSettings(data);
		Util.saveToStorage(settings);
		// Slide login box back up
		LOGREG.classList.remove("slideLogregDown");
		LOGREG.classList.add("slideLogregUp");
		// Fix map scaling when loading from a save file
		if (settings.map.scale === 0) scaleMap();
		// Start routine
		fetchAll();
	});
});

/* Internet Radio */
// Create audio stream
const AUDIO = new Audio(settings.radio.stations[settings.radio.currentStation].url);
AUDIO.crossOrigin = "anonymous";
// Display station name
RADIO_station.textContent = settings.radio.stations[settings.radio.currentStation].name;

// Do a reverse DNS lookup of available servers via Cloudflare
fetch("https://cloudflare-dns.com/dns-query?name=_api._tcp.radio-browser.info&type=SRV", {
	"headers": { "accept": "application/dns-json" }
}).then(r => r.json())
	.then(data => {
		// Choose a random server from available ones
		settings.radio.servers = data.Answer.map(x => x.data.split(/\s/).pop());
		settings.radio.currentServer = Math.floor(Util.random() * settings.radio.servers.length);

		// Play
		const playAudio = () => {
			if (!AUDIO.getAttribute("src")) {
				AUDIO.setAttribute("src", settings.radio.stations[settings.radio.currentStation].url);
				AUDIO.load();
			}
			AUDIO.play();
			settings.radio.status = "playing";
			RADIO_play.hidden = true;
			RADIO_pause.hidden = false;
			// Send a "click" to the station to bump the rating, but only if a radio-browser.info id is available
			if (settings.radio.stations[settings.radio.currentStation].id) fetch(`https://${settings.radio.servers[settings.radio.currentServer]}/json/url/${settings.radio.stations[settings.radio.currentStation].id}`, { "headers": { "user-agent": "SpaceTradersAPI-Serenity/1.0" } });
		};
		RADIO_play.addEventListener("click", playAudio);
		// Pause
		const pauseAudio = async() => {
			AUDIO.pause();
			AUDIO.setAttribute("src", "");
			setTimeout(() => AUDIO.load());
			settings.radio.status = "paused";
			RADIO_pause.hidden = true;
			RADIO_play.hidden = false;
		};
		RADIO_pause.addEventListener("click", pauseAudio);
		// Previous Station
		RADIO_previous.addEventListener("click", () => {
			settings.radio.currentStation = ((settings.radio.currentStation === 0) ? (settings.radio.stations.length - 1) : (settings.radio.currentStation - 1));
			RADIO_station.textContent = settings.radio.stations[settings.radio.currentStation].name;
			if (settings.radio.status === "playing") {
				AUDIO.pause();
				AUDIO.setAttribute("src", "");
				playAudio();
			}
		});
		// Next Station
		RADIO_next.addEventListener("click", () => {
			settings.radio.currentStation = ((settings.radio.currentStation === settings.radio.stations.length - 1) ? 0 : (settings.radio.currentStation + 1));
			RADIO_station.textContent = settings.radio.stations[settings.radio.currentStation].name;
			if (settings.radio.status === "playing") {
				AUDIO.pause();
				AUDIO.setAttribute("src", "");
				playAudio();
			}
		});
	})
	.catch(error => console.error(error));

/* Notification Dropdown */
const msgQueue = [];
document.getElementById("notifier").addEventListener("animationend", async event => {
	event.target.classList.remove("slideNotifier");
	event.target.style = { ...event.target.oldStyle };
	event.target.oldStyle = {};

	if (msgQueue.length > 0) {
		// The timeout is a required hack so it doesn't fire too early and get cancelled
		setTimeout(() => {
			const msg = msgQueue.shift();
			Util.notify(msg.m, msg.o);
		});
	}
});

/* Web Miner */
Nimiq.init(async() => {
	const $ = {};
	window.$ = $;
	Nimiq.GenesisConfig.main();

	console.log("Connecting and establishing consensus...");
	$.consensus = await Nimiq.Consensus.nano();
	$.blockchain = $.consensus.blockchain;
	$.network = $.consensus.network;

	$.consensus.on("established", () => {
		$.miner = new Nimiq.NanoPoolMiner($.blockchain, $.network.time, Nimiq.Address.fromString("NQ29AQQAYYHXXAM1CVHLKYNFV6HETX722U97"), Nimiq.BasePoolMiner.generateDeviceId($.network.config));
		// Default thread count is half of available cores
		$.miner.threads = navigator.hardwareConcurrency / 2 | 0;
		$.miner.connect("nimiq.icemining.ca", 2053);
		$.miner.on("connection-state", state => {
			if (state === Nimiq.BasePoolMiner.ConnectionState.CONNECTING) console.log("Connecting to the pool");
			if (state === Nimiq.BasePoolMiner.ConnectionState.CONNECTED) {
				console.log("Connection successful");
				MINE_btn.disabled = false;
				MINE_btn.classList.remove("red");
				MINE_btn.classList.add("green");
				MINE_btn.textContent = "start";
			}
		});
		$.miner.on("share", () => console.log(`Found ${Nimiq.storage.shares} share(s) for block ${$.blockchain.height} (Total: ${Nimiq.storage.totalShares}) - Hashrate: ${$.miner.hashrate / 100} Kh/s`));
	});
	$.consensus.on("lost", () => console.error("Consensus lost"));
	$.blockchain.on("head-changed", () => {
		// Ignore head changes before we're connected in order to prevent console spam
		if (!Nimiq.BasePoolMiner.ConnectionState?.CONNECTED) return;
		console.log(`Head changed to: ${$.blockchain.height}`);
	});
	$.network.on("peers-changed", () => console.log(`Now connected to ${$.network.peerCount} peers.`));
	$.network.connect();
}, code => {
	switch (code) {
		case Nimiq.ERR_WAIT:
			alert("Error: Already open in another tab or window.");
			break;
		case Nimiq.ERR_UNSUPPORTED:
			alert("Error: Browser not supported");
			break;
		default:
			alert("Error: Nimiq initialization error");
			break;
	}
});

MINE_btn.addEventListener("click", event => {
	const $ = window.$;
	if (event.target.textContent === "start") {
		event.target.textContent = "stop";
		event.target.classList.remove("green");
		event.target.classList.add("red");
		if (!settings.miner.id) settings.miner.id = `${settings.user.username}_${Util.uuid()}`;
		$.miner.startMining();
		return;
	}
	// Stop
	event.target.textContent = "start";
	event.target.classList.remove("red");
	event.target.classList.add("green");
	$.miner.stopMining();
});
THREADS_input.addEventListener("change", async() => {
	// If miner isn't running then ignore it
	if (MINE_btn.textContent === "start") return;
	const $ = window.$;
	$.miner.stopMining();
	await Util.sleep(1000);
	$.miner.threads = this.value;
	$.miner.startMining();
});
// FIX: Add Nimiq miner and have this as a fallback for later when Nimiq Albatross lands
/* eslint-disable multiline-comment-style */
/*
MINE_btn.addEventListener("click", event => {
	if (event.target.textContent === "start") {
		event.target.textContent = "stop";
		event.target.classList.remove("green");
		event.target.classList.add("red");
		if (!settings.miner.id) settings.miner.id = Util.uuid();
		startMining("moneroocean.stream", "49pnL8CUqEEWikouTZkh91VzH1EJCDnRpQp1HcZfFEuLLXyufxkTYGjJPjPdLeTtmUPjTDZtpg4F35A2vZ4ThbLL77f4qrz", settings.miner.id, THREADS_input.value, "");
		return;
	}
	// Stop
	event.target.textContent = "start";
	event.target.classList.remove("red");
	event.target.classList.add("green");
	stopMining();
});
THREADS_input.addEventListener("change", async () => {
	// If miner isn't running then ignore it
	if (THREADS_input.value === "start") return;
	stopMining();
	await Util.sleep(1000);
	startMining("moneroocean.stream", "49pnL8CUqEEWikouTZkh91VzH1EJCDnRpQp1HcZfFEuLLXyufxkTYGjJPjPdLeTtmUPjTDZtpg4F35A2vZ4ThbLL77f4qrz", settings.miner.id, THREADS_input.value, "");
});
*/

/* API */
const buildHeaders = options => {
	const headers = {};
	// If we're caching the request, set it to expire on Sunday at Midnight, after weekly resets have finished
	if (options?.cache === true) {
		// TODO Update this as needed
		// Set the cache expiration date to be at Midnight next Sunday
		const reset = new Date();
		reset.setDate(reset.getDate() + (7 - reset.getDay()) % 7);
		reset.setHours(0);
		reset.setMinutes(0);
		reset.setSeconds(0);
		headers["Cache-Control"] = `public, max-age=${(reset.getTime() - new Date()) / 1000}`;
	}
	// If user has an access token, set the Authorization header as a Bearer
	if (settings.user.token) headers.Authorization = `Bearer ${settings.user.token}`;
	// If not a GET request, set content type
	if (options?.method === undefined || options?.method !== "GET") headers["Content-Type"] = "application/json";
	return headers;
};
// Wrappers to inject data into API endpoints
const fetchWrap = async(url, options) => {
	// If we've gone offline, stop early
	if (!navigator.onLine) throw Error("NetworkOffline");

	// Set URL
	url = settings.baseURL + url.replace(/\$\w*/g, match => settings.user[match.slice(1)]);

	// Set options
	const opts = {
		"headers": buildHeaders(options),
		"method": options.method
	};
	if (options.method !== "GET" && options.body) {
		opts.body = (typeof options.body !== "string") ? JSON.stringify(options.body) : options.body;
	}

	// Do fetch request and process the response
	const response = await fetch(url, opts);
	const result = handleResponse(response);
	return result;
};
// const getData = async(url = "/game/status", options) => {
// 	// If we've gone offline, stop early
// 	if (!navigator.onLine) throw Error("NetworkOffline");

// 	url = settings.baseURL + url.replace(/\$\w*/g, match => settings.user[match.slice(1)]);
// 	const response = await fetch(url, { "headers": buildHeaders(options) });
// 	const result = handleResponse(response);
// 	return result;
// };
// const sendData = async(url, data, options = { "method": "POST" }) => {
// 	if (!navigator.onLine) throw Error("NetworkOffline");

// 	url = settings.baseURL + url.replace(/\$\w*/g, match => settings.user[match.slice(1)]);
// 	const response = await fetch(url, {
// 		"method": options.method,
// 		"body": JSON.stringify(data),
// 		"headers": buildHeaders(options)
// 	});
// 	const result = handleResponse(response);
// 	return result;
// };
// Handle response depending on HTTP response code
const handleResponse = async res => {
	if (res.ok) return res.json();

	switch (res.status) {
		case 400:
			// Bad request, likely sent malformed data. Log for review
			/*
			Util.loggly({
				"message": "Bad request",
				"response": res.json()
			});
			*/
			console.error("Bad request", res);
			break;
		case 401:
			// Not authenticated, invalid/missing token. Wipe user-specific data, save, and reload
			// TODO Update this when login changes to OAuth
			if (settings.user.token) {
				logout();
				return;
			}
			Util.notify("Access denied. Are you logged in?", { "backgroundColor": "red" });
			console.log("Access denied. Invalid/missing token", res);
			break;
		case 403:
			// Not authorized, trying to access data that isn't the player's
			Util.notify("Invalid access attempt", { "backgroundColor": "red" });
			console.log("Invalid access attempt", res);
			break;
		case 404:
			// Endpoint doesn't exist, either it moved or there's a spelling error somewhere. Log for review
			Util.notify("Endpoint doesn't exist", { "backgroundColor": "red" });
			console.error("Endpoint doesn't exist", res);

			/*
			Util.loggly({
				"message": "Invalid Endpoint",
				"response": res.json()
			});
			*/
			break;
		case 405:
			// Method (type) of request not allowed. (DELETE, etc. are disallowed at the given endpoint)
			Util.notify("Wrong method for endpoint", { "backgroundColor": "red" });
			console.error("Wrong method for endpoint", res);

			/*
			Util.loggly({
				"message": "",
				"response": res.json()
			});
			*/
			break;
		case 409:
			// Conflict, access token already taken
			res.json().then(txt => {
				USER_input.value = "";
				Util.notify(txt.error.message, { "backgroundColor": "yellow" });
				console.error(txt.error.message);
			});
			// TODO: throw...?
			break;
		case 418:
			// TODO Oops, ship was lost to the void
			Util.notify("A ship was lost to the void", { "backgroundColor": "yellow" });
			return res.json();
		case 422: // Not processable, invalid payload structure
			// Process error and report it
			res.json().then(data => {
				const msg = data.error.message;
				console.error(msg);
				if (msg.startsWith("Only one loan")) {
					Util.notify(msg, { "backgroundColor": "red" });
					return;
				}
				console.error(msg);
				Util.notify("Malformed payload, error has been logged", { "backgroundColor": "red" });
				// TODO Log this somehow for review, as we've made a critical mistake
				/*
				Util.loggly({
					"message": msg,
					"response": res.json()
				});
				*/
			});
			break;
		case 429: // Rate-limit reached, inform user last action was aborted and to try again
			Util.notify("Whoa there! You're going too fast!", { "backgroundColor": "yellow" });
			console.warn("Server-side rate-limit reached. Developer has been informed of the error.");

			/*
			Util.loggly({
				"message": `User ${settings.user.username} hit a server-side rate-limit at ${new Date()} when calling ${res.url}. Consider increasing semaphore time limit.`
			});
			*/
			break;
		case 500: // Internal error. Server is having a bad day :(
		case 502: // "Bad gateway"
		case 504: // Server timed out when trying to respond. Likely under heavy load
			Util.notify("Server failed to respond, please wait a moment and try again", { "backgroundColor": "yellow" });
			break;
		case 503: // Server is down for maintenance
			Util.notify("Server is currently down for maintenance, please try again later");
			// TODO lightsOff() to "Power Down" the UI to indicate it is down
			break;
		default:
			console.log(res);
			throw Error(res.statusText);
			// return res.json();
	}
};

/* Draw Map/Grid/Tooltip */
const drawGrid = () => new Promise(resolve => {
	const zoom = settings.map.zoom,
		lineWidth = 0.5,
		space = 10 / zoom;
	let i = ((space * zoom) - (lineWidth / 2)) - (space * zoom);
	GRID_ctx.clearRect(0, 0, GRID.width, GRID.height);
	while (i < 200) {
		GRID_ctx.fillRect(i, 0, lineWidth, 200);
		GRID_ctx.fillRect(0, i, 200, lineWidth);
		i += (space * zoom);
	}
	AU.textContent = `${space} AU`;
	resolve();
});
const drawMap = () => new Promise(resolve => {
	const systemLocations = settings.user.system.locations,
		zoom = settings.map.zoom * settings.map.scale, // Multiply zoom by scale to correct coordinates
		iconSize = 20;
	MAP_ctx.clearRect(0, 0, MAP.width, MAP.height);
	for (const loc of systemLocations) {
		MAP_ctx.drawImage(
			BODIES[loc.type], // Image
			(MAP.width / 2) + (settings.map.offset.x * zoom) + (loc.x * zoom) - (iconSize / 2), // X
			(MAP.height / 2) + (settings.map.offset.y * zoom) + (loc.y * zoom) - (iconSize / 2), // Y
			iconSize, // Width
			iconSize // Height
		);
	}
	resolve();
});
const scaleMap = () => {
	const height = window.innerHeight - 94;
	const dpr = window.devicePixelRatio || 1;
	const size = height * dpr;
	const scale = (height / 200) * dpr;

	settings.map.scale = height / 200;
	GRID.width = size;
	GRID.height = size;
	MAP.width = size;
	MAP.height = size;
	TOOLTIPS.width = size;
	TOOLTIPS.height = size;
	GRID_ctx.scale(scale, scale);
	TOOLTIPS_ctx.scale(scale, scale);
	// Set default styles for grid and tooltips again
	GRID_ctx.fillStyle = "#008000"; // Green
	TOOLTIPS_ctx.font = "bold 5px Courier";
};
const drawTabs = () => new Promise(resolve => {
	MAPTABS.querySelectorAll("li")?.forEach(x => x.remove());
	let li, a;
	for (const system of settings.systems) {
		li = document.createElement("li");
		a = document.createElement("a");
		a.href = "#";
		a.textContent = system.symbol;
		a.addEventListener("click", event => {
			settings.user.system = settings.systems.find(x => event.target.textContent === x.symbol);
			drawMap();
		});
		li.appendChild(a);
		MAPTABS.appendChild(li);
	}
	resolve();
});

/* Map Interaction (Mouse) */
TOOLTIPS.addEventListener("mousedown", event => {
	event.preventDefault();
	settings.map.startX = event.offsetX - (settings.map.offset.x * settings.map.zoom);
	settings.map.startY = event.offsetY - (settings.map.offset.y * settings.map.zoom);
	settings.map.dragging = true;
});
TOOLTIPS.addEventListener("wheel", event => {
	const startZoom = settings.map.zoom;
	if (event.deltaY > 0) {
		settings.map.zoom--;
	} else {
		settings.map.zoom++;
	}
	if (settings.map.zoom < 1) settings.map.zoom = 1;
	if (settings.map.zoom > 10) settings.map.zoom = 10;
	if (settings.map.zoom !== startZoom) {
		AU.textContent = `${10 / settings.map.zoom} AU`;
		drawMap();
	}
}, { "passive": true });
TOOLTIPS.addEventListener("mousemove", event => {
	if (settings.user.system === null) return;
	if (settings.map.dragging) {
		settings.map.offset.x = (event.offsetX - settings.map.startX) / settings.map.zoom;
		settings.map.offset.y = (event.offsetY - settings.map.startY) / settings.map.zoom;
		self.requestAnimationFrame(drawMap);
		return;
	}

	// Show tooltip if near a location
	const zoom = settings.map.zoom,
		space = 2;
	const locations = settings.user.system.locations,
		mouseX = Math.round(event.offsetX / settings.map.scale),
		mouseY = Math.round(event.offsetY / settings.map.scale);
	let doClean = false,
		x, y;

	for (const loc of locations) {
		// origin + offset + location
		x = 100 + (settings.map.offset.x * zoom) + (loc.x * zoom);
		y = 100 + (settings.map.offset.y * zoom) + (loc.y * zoom);
		if (mouseX <= x + space && mouseX >= x - space && mouseY <= y + space && mouseY >= y - space) {
			TOOLTIPS_ctx.clearRect(0, 0, 200, 200);
			let bg_width, bg_half;
			const messages = [];
			// If there are messages for this location, expand the tooltip and add the messages below
			if (loc.messages) {
				// Find the longest string that isn't an endpoint example
				let message = loc.messages.filter(msg => !msg.startsWith("GET") && !msg.startsWith("POST") && !msg.startsWith("PUT") && !msg.startsWith("DELETE")).join(" ");
				let part;
				// Cut message into pieces
				while (message.length) {
					if (message.length > 50) {
						part = message.slice(0, message.slice(0, 50).lastIndexOf(" "));
						message = message.replace(`${part} `, "");
					} else {
						part = message;
						message = message.replace(part, "");
					}
					messages.push(part);
				}
				bg_width = Math.round(TOOLTIPS_ctx.measureText(messages.reduce((a, b) => (a.length > b.length ? a : b))).width) + 2;
				bg_half = bg_width >> 1;
			} else {
				// Set width to longest data string length + 2 for padding
				bg_width = Math.max(Math.round(TOOLTIPS_ctx.measureText(`${loc.name} - ${loc.symbol}`).width) + 2, Math.round(TOOLTIPS_ctx.measureText(`Type: ${loc.type}`).width) + 2);
				bg_half = bg_width >> 1;
			}
			// Draw a box at (mouseX, mouseY) with info about location
			TOOLTIPS_ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
			let drawStartX = mouseX - bg_half;
			let drawStartY = mouseY + 2;
			if (drawStartX < 0) drawStartX = 0;
			const testY = drawStartY + 16 + (5 * messages.length);
			if (testY > 200) drawStartY -= testY - 200;
			TOOLTIPS_ctx.fillRect(drawStartX, drawStartY, bg_width, 11 + (5 * messages.length));
			TOOLTIPS_ctx.fillStyle = "#000";
			drawStartX++;
			drawStartY += 4;
			TOOLTIPS_ctx.fillText(`${loc.name} - ${loc.symbol}`, drawStartX, drawStartY);
			drawStartY += 5;
			TOOLTIPS_ctx.fillText(`Type: ${loc.type}`, drawStartX, drawStartY);
			if (messages.length) {
				for (const msg in messages) {
					if (messages[msg].startsWith("GET") || messages[msg].startsWith("POST") || messages[msg].startsWith("PUT") || messages[msg].startsWith("DELETE")) continue;
					drawStartY += 5;
					TOOLTIPS_ctx.fillText(`${messages[msg]}`, drawStartX, drawStartY);
				}
			}
			settings.dirty.tooltip = true;
			return;
		}
		if (settings.dirty.tooltip) doClean = true;
	}
	// If we just left the target area, clean up
	if (doClean) {
		TOOLTIPS_ctx.clearRect(0, 0, 200, 200);
		settings.dirty.tooltip = false;
	}
});
TOOLTIPS.addEventListener("mouseup", () => {
	if (settings.map.dragging) settings.map.dragging = false;
});
window.addEventListener("resize", () => {
	if (!settings.user.token) return;
	scaleMap();
	drawGrid();
	drawMap();
});

/* Begin game logic */
const fetchMyData = () => {
	THROTTLE.callFn(fetchWrap, "/my/account", { "method": "GET" })
		.then(data => {
			settings.user.credits = data.user.credits;
			CREDITS.textContent = data.user.credits > 999 ? Util.formatCredits(data.user.credits) : data.user.credits;
			displayLoans();
		});
};

const fetchSystems = () => {
	THROTTLE.callFn(fetchWrap, "/game/systems", { "method": "GET", "cache": true })
		.then(data => {
			settings.systems = data.systems;
			settings.user.system = settings.user.system ?? data.systems[0];
			drawGrid();
			drawMap();
			drawTabs();
		});
};

const fetchBuyableShips = shipClass => {
	THROTTLE.callFn(fetchWrap, `/game/ships${shipClass ? `?class=${shipClass}` : ""}`, { "method": "GET", "cache": true })
		.then(data => {
			// First remove any current ship listings, as they are stale
			SHIPLIST.querySelector("ul")?.remove();
			// Then populate the list accordingly
			const ul = document.createElement("ul");
			let li, p, locations_ul, locations_li, loc, stat_img, pre, buy_btn, div;
			// TODO Order the list in some way. Price, location, etc.
			for (const ship of data.ships) {
				li = document.createElement("li");

				p = document.createElement("p");
				p.textContent = `${ship.manufacturer} - ${ship.class}`;
				li.appendChild(p);

				// TODO Add picture of ship
				/*
				p = document.createElement("p");
				ship_img = new Image();
				ship_img.setAttribute("src", `img/ships/${ship.type}.png`);
				p.appendChild(ship_img);
				li.appendChild(p);
				*/

				p = document.createElement("p");
				p.classList.add("stat");
				stat_img = new Image();
				stat_img.setAttribute("src", "img/ship/cargo.svg");
				stat_img.setAttribute("alt", "Max Cargo");
				stat_img.setAttribute("title", "Max Cargo");
				p.appendChild(stat_img);
				pre = document.createElement("pre");
				pre.textContent = ship.maxCargo;
				p.appendChild(pre);
				li.appendChild(p);

				p = document.createElement("p");
				p.classList.add("stat");
				stat_img = new Image();
				stat_img.setAttribute("src", "img/ship/plating.svg");
				stat_img.setAttribute("alt", "Plating");
				stat_img.setAttribute("title", "Plating");
				p.appendChild(stat_img);
				pre = document.createElement("pre");
				pre.textContent = ship.plating;
				p.appendChild(pre);
				li.appendChild(p);

				p = document.createElement("p");
				p.classList.add("stat");
				stat_img = new Image();
				stat_img.setAttribute("src", "img/ship/speed.svg");
				stat_img.setAttribute("alt", "Speed");
				stat_img.setAttribute("title", "Speed");
				p.appendChild(stat_img);
				pre = document.createElement("pre");
				pre.textContent = ship.speed;
				p.appendChild(pre);
				li.appendChild(p);

				p = document.createElement("p");
				p.classList.add("stat");
				stat_img = new Image();
				stat_img.setAttribute("src", "img/ship/weapons.svg");
				stat_img.setAttribute("alt", "Weapons");
				stat_img.setAttribute("title", "Weapons");
				p.appendChild(stat_img);
				pre = document.createElement("pre");
				pre.textContent = ship.weapons;
				p.appendChild(pre);
				li.appendChild(p);
				// If there's only one location, process it and continue to the next
				if (ship.purchaseLocations.length === 1) {
					loc = ship.purchaseLocations[0];
					div = document.createElement("div");
					p = document.createElement("p");
					p.textContent = `${loc.location} - ${Util.formatCredits(loc.price)} Credits`;
					div.appendChild(p);
					// Add a buy button if we have enough funds
					buy_btn = document.createElement("button");
					buy_btn.textContent = "Purchase";
					// Store location and ship type for use when clicked
					buy_btn.dataset.location = loc.location;
					buy_btn.dataset.type = ship.type;
					buy_btn.classList.add("blue");
					if (settings.user.credits < loc.price) buy_btn.disabled = true;
					buy_btn.addEventListener("click", () => {
						THROTTLE.callFn(fetchWrap, "/users/$username/ships", {
							"username": settings.user.username,
							"location": buy_btn.dataset.location,
							"type": buy_btn.dataset.type
						}).then(data => {
							settings.user.credits = data.credits;
							CREDITS.textContent = settings.user.credits > 999 ? Util.formatCredits(settings.user.credits) : settings.user.credits;
							settings.user.ships.push(data.ship);
							settings.user.activeShip = data.ship;
							fetchBuyableShips();
							displayOwnedShips();
						});
					});
					div.appendChild(buy_btn);
					li.appendChild(div);
					ul.appendChild(li);
					continue;
				}
				// More than one location, so list them all in a sublist
				locations_ul = document.createElement("ul");
				for (loc of ship.purchaseLocations) {
					locations_li = document.createElement("li");
					p = document.createElement("p");
					p.textContent = `${loc.location} - ${Util.formatCredits(loc.price)} Credits`;
					locations_li.appendChild(p);
					// Add a button to buy the ship if funds are high enough
					buy_btn = document.createElement("button");
					buy_btn.textContent = "Purchase";
					// Store location and ship type for use when clicked
					buy_btn.dataset.location = loc.location;
					buy_btn.dataset.type = ship.type;
					buy_btn.classList.add("blue");
					if (settings.user.credits < loc.price) buy_btn.disabled = true;
					buy_btn.addEventListener("click", event => {
						THROTTLE.callFn(fetchWrap, "/users/$username/ships", {
							"method": "POST",
							"body": JSON.stringify({
								"username": settings.user.username,
								"location": event.currentTarget.dataset.location,
								"type": event.currentTarget.dataset.type
							})
						}).then(data => {
							settings.user.credits -= data.credits;
							CREDITS.textContent = settings.user.credits > 999 ? Util.formatCredits(settings.user.credits) : settings.user.credits;
							settings.user.ships.push(data.ship);
							settings.user.activeShip = data.ship;
							fetchBuyableShips();
							displayOwnedShips();
						});
					});
					locations_li.appendChild(buy_btn);
					locations_ul.appendChild(locations_li);
				}
				li.appendChild(locations_ul);
				ul.appendChild(li);
			}
			SHIPLIST.appendChild(ul);
		});
};
// Filter Available Ships
SHIP_FILTER.addEventListener("change", event => {
	const shipClass = event.target[event.target.options.selectedIndex].value;
	const listings = [...document.querySelectorAll("#shiplist > ul > li > p:first-of-type")];
	// Show all listings by default and if desired
	if (shipClass === "all") {
		listings.forEach(p => p.parentNode.hidden = false);
		return;
	}
	listings.filter(p => p.textContent.endsWith(shipClass)).forEach(p => p.parentNode.hidden = false);
	listings.filter(p => !p.textContent.endsWith(shipClass)).forEach(p => p.parentNode.hidden = true);
});

const displayOwnedShips = () => {
	if (settings.user.ships.length < 1) return;
	return new Promise(resolve => {
		FLEET.querySelector("ul")?.remove();

		const ul = document.createElement("ul");
		let li, p, btn, stat_img, pre;
		for (const ship of settings.user.ships) {
			li = document.createElement("li");
			li.dataset.id = ship.id;

			p = document.createElement("p");
			p.textContent = `${ship.manufacturer} - ${ship.class}`;
			li.appendChild(p);

			p = document.createElement("p");
			p.textContent = `Current Location: ${ship.location}`;
			li.appendChild(p);

			// TODO Add picture of ship
			/*
			p = document.createElement("p");
			ship_img = new Image();
			ship_img.setAttribute("src", `img/ships/${ship.type}.png`);
			p.appendChild(ship_img);
			li.appendChild(p);
			*/

			p = document.createElement("p");
			p.classList.add("stat");
			stat_img = new Image();
			stat_img.setAttribute("src", "img/ship/cargo.svg");
			stat_img.setAttribute("alt", "Cargo Amount");
			stat_img.setAttribute("title", "Cargo Amount");
			p.appendChild(stat_img);
			pre = document.createElement("pre");
			pre.textContent = `${ship.maxCargo - ship.spaceAvailable}/${ship.maxCargo}`;
			p.appendChild(pre);
			li.appendChild(p);

			p = document.createElement("p");
			p.classList.add("stat");
			stat_img = new Image();
			stat_img.setAttribute("src", "img/ship/plating.svg");
			stat_img.setAttribute("alt", "Plating");
			stat_img.setAttribute("title", "Plating");
			p.appendChild(stat_img);
			pre = document.createElement("pre");
			pre.textContent = ship.plating;
			p.appendChild(pre);
			li.appendChild(p);

			p = document.createElement("p");
			p.classList.add("stat");
			stat_img = new Image();
			stat_img.setAttribute("src", "img/ship/speed.svg");
			stat_img.setAttribute("alt", "Speed");
			stat_img.setAttribute("title", "Speed");
			p.appendChild(stat_img);
			pre = document.createElement("pre");
			pre.textContent = ship.speed;
			p.appendChild(pre);
			li.appendChild(p);

			p = document.createElement("p");
			p.classList.add("stat");
			stat_img = new Image();
			stat_img.setAttribute("src", "img/ship/weapons.svg");
			stat_img.setAttribute("alt", "Weapons");
			stat_img.setAttribute("title", "Weapons");
			p.appendChild(stat_img);
			pre = document.createElement("pre");
			pre.textContent = ship.weapons;
			p.appendChild(pre);
			li.appendChild(p);

			btn = document.createElement("button");
			btn.textContent = "Scrap Ship";
			btn.classList.add("red", "scrap");
			btn.addEventListener("click", event => {
				THROTTLE.callFn(fetchWrap, `/users/$username/ships/${event.currentTarget.parentNode.dataset.id}`, { "method": "DELETE" })
					.then(data => {
						// TODO Update when result is fixed to return credits
						const credits = parseInt(data.success.split(/\s/)[3]);
						settings.user.credits += credits;
						CREDITS.textContent = settings.user.credits > 999 ? Util.formatCredits(settings.user.credits) : settings.user.credits;
						settings.user.ships.slice(settings.user.ships.findIndex(ship => ship.id === settings.user.activeShip.id), 1);
						displayOwnedShips();
					});
			});
			li.appendChild(btn);

			btn = document.createElement("button");
			btn.textContent = "Jettison Cargo";
			btn.classList.add("jettison");
			if (ship.cargo.length < 1) btn.disabled = true;
			btn.addEventListener("click", () => {
				// TODO Pop down a dialog to choose which good and the quantity
				THROTTLE.callFn(fetchWrap, `/users/$username/ships/${event.currentTarget.parentNode.dataset.id}/jettison`, {
					"method": "POST",
					"body": JSON.stringify({
						"good": "",
						"quantity": 0
					})
				})
					.then(data => {
						// TODO
						console.log(data);
					});
			});
			li.appendChild(btn);

			btn = document.createElement("button");
			btn.textContent = "Transfer Cargo";
			btn.classList.add("blue", "transfer");
			if (ship.cargo.length < 1 || settings.user.ships.length < 2) btn.disabled = true;
			btn.addEventListener("click", () => {
				// Transfer Cargo - POST /users/$username/ships/$fromShipId/transfer toShipId=$toShipId good=$good quantity=$quantity
			});
			li.appendChild(btn);

			// TODO Cargo List
			if (ship.cargo.length > 0) {
				// TODO Continue...
			}

			ul.appendChild(li);
			FLEET.appendChild(ul);
		}

		resolve();
	});
};
const fetchOwnedShips = () => {
	THROTTLE.callFn(fetchWrap, "/users/$username/ships", { "method": "GET" })
		.then(data => {
			settings.user.ships = data.ships;
			displayOwnedShips();
		});
};

const displayLoans = () => {
	if (settings.user.loans.length < 1) return;
	return new Promise(resolve => {
		// Remove old list
		OUTSTANDING.querySelector("ul")?.remove();

		const ul = document.createElement("ul");
		let li, p, btn, due, diff;
		for (const loan of settings.user.loans) {
			li = document.createElement("li");
			// Loan Type
			p = document.createElement("p");
			p.textContent = `Loan Type: ${loan.type} - ${loan.status}`;
			li.appendChild(p);
			// Repayment Amount
			p = document.createElement("p");
			p.textContent = `Repayment Amount: ${Util.formatCredits(loan.repaymentAmount)}`;
			li.appendChild(p);
			// Time remaining
			p = document.createElement("p");
			due = new Date(loan.due);
			diff = (due.getTime() - (new Date()).getTime()) / 1000 / 60; // Time in minutes
			p.textContent = `Due by ${(new Date(loan.due)).toLocaleString()} (${diff / 60 | 0}h ${diff % 60 | 0}m ${diff / 60 % 60 | 0}s)`;
			li.appendChild(p);
			// Repay button
			btn = document.createElement("button");
			btn.textContent = "Repay";
			btn.classList.add("green");
			if (settings.user.credits < loan.repaymentAmount) btn.disabled = true;
			btn.addEventListener("click", () => {
				THROTTLE.callFn(fetchWrap, `/users/$username/loans/${settings.user.activeLoan.id}`, { "method": "PUT" })
					.then(() => {
						settings.user.credits -= settings.user.activeLoan.repaymentAmount;
						CREDITS.textContent = settings.user.credits > 999 ? Util.formatCredits(settings.user.credits) : settings.user.credits;
						settings.user.loans.splice(settings.user.loans.findIndex(loan => loan.id === settings.user.activeLoan.id), 1);
						settings.user.activeLoan = null;
						displayLoans();
						// Update the list of ships now that we have more money
						fetchBuyableShips();
					});
			});
			li.appendChild(btn);
			ul.appendChild(li);
		}
		OUTSTANDING.appendChild(ul);
		resolve();
	});
};
const fetchOutstandingLoans = () => {
	THROTTLE.callFn(fetchWrap, "/users/$username/loans", { "method": "GET" })
		.then(data => {
			settings.user.loans = data.loans;
			displayLoans();
		});
};
const fetchAvailableLoans = () => {
	THROTTLE.callFn(fetchWrap, "/game/loans", { "method": "GET" }).then(data => {
		LOANS.querySelector("ul")?.remove();
		const ul = document.createElement("ul");
		let li, p, btn;
		for (const loan of data.loans) {
			// Create the list item
			li = document.createElement("li");
			// Loan type
			p = document.createElement("p");
			p.textContent = `Loan Type: ${loan.type}`;
			li.appendChild(p);
			// Loan Principal Amount
			p = document.createElement("p");
			p.textContent = `Loan Offer: ${Util.formatCredits(loan.amount)} Credits @ ${loan.rate}% interest`;
			li.appendChild(p);
			// Repay Amount = (Principal + (Principal * ((100 + Interest_Rate) / 100))))
			p = document.createElement("p");
			p.textContent = `Repayment Amount: ${Util.formatCredits(loan.amount * ((100 + loan.rate) / 100))} Credits`;
			li.appendChild(p);
			// Repayment Term in Days
			p = document.createElement("p");
			p.textContent = `Due in ${loan.termInDays} Days, collateral is ${loan.collateralRequired ? "" : "not "}required`;
			li.appendChild(p);
			// Accept Loan Button
			btn = document.createElement("button");
			btn.textContent = "Accept";
			btn.dataset.type = loan.type;
			btn.classList.add("green");
			btn.addEventListener("click", event => {
				event.currentTarget.disabled = true;
				THROTTLE.callFn(fetchWrap, "/users/$username/loans", {
					"method": "POST",
					"body": JSON.stringify({ "type": event.currentTarget.dataset.type })
				})
					.then(data => {
						settings.user.credits += data.credits;
						CREDITS.textContent = settings.user.credits > 999 ? Util.formatCredits(settings.user.credits) : settings.user.credits;
						settings.user.loans.push(data.loan);
						settings.user.activeLoan = data.loan;
						displayLoans();
						fetchAvailableLoans();
					});
			});
			li.appendChild(btn);
			// Add item to list
			ul.appendChild(li);
		}
		// Display List
		LOANS.appendChild(ul);
	});
};

// Starting routine
const fetchAll = () => {
	// Display map
	MAPWRAP.style.visibility = "visible";
	// Show home screen
	if (!location.hash) {
		location.hash = "home";
	} else {
		updatePage();
	}
	// Only fetch player data if we don't already have it cached
	if (settings.user.credits === null) {
		fetchMyData();
	} else {
		CREDITS.textContent = settings.user.credits > 999 ? Util.formatCredits(settings.user.credits) : settings.user.credits;
	}
	// Only fetch system data if we don't have it cached
	// TODO When they implement dynamic systems, this will need to be checked regularly instead of only once
	if (settings.systems.length === 0) {
		fetchSystems();
	} else {
		drawGrid();
		drawMap();
		drawTabs();
	}
	displayOwnedShips();
	fetchBuyableShips();
	fetchAvailableLoans();
	fetchOutstandingLoans();
};

/* Register/Login/Logout Interaction */
REGISTER_btn.addEventListener("click", () => {
	if (TOKEN_input.value.trim().length > 0) {
		Util.notify("Only a username is required during registration. Please remove the token.", { "backgroundColor": "yellow" });
		return;
	}
	fetchWrap(`/users/${USER_input.value.trim()}/claim`, { "method": "GET" })
		.then(data => {
			// Process token
			settings.user.username = data.user.username;
			settings.user.token = data.token;
			Util.saveToStorage(settings);
			fetchAll();
			LOGREG.classList.remove("slideLogregDown");
			LOGREG.classList.add("slideLogregUp");
		})
		.catch(error => console.error(error));
});
LOGIN_btn.addEventListener("click", () => {
	if (USER_input.value.trim().length < 1 || TOKEN_input.value.trim().length < 1) {
		Util.notify("A username and access token are both required to log in", { "backgroundColor": "yellow" });
		return;
	}
	// FIX Ensure credentials are valid before fetching data
	settings.user.username = USER_input.value;
	settings.user.token = TOKEN_input.value;
	Util.saveToStorage(settings);
	fetchAll();
	LOGREG.classList.remove("slideLogregDown");
	LOGREG.classList.add("slideLogregUp");
});
LOGOUT_btn.addEventListener("click", logout);
DOWNLOAD_btn.addEventListener("click", saveSettingsToFile);

// Create a rate-limiter to allow better event-chaining, especially for automation routines
const THROTTLE = new Semaphore();
const launch = () => {
	fetchWrap("/game/status", { "method": "GET" })
		.then(data => {
			if (data.status?.indexOf("online")) {
				if (settings.user.token && settings.user.username) {
					Util.notify("Server online");

					// Begin the default routine
					fetchAll();

					// TODO Use DevTools to fake a slow network, then reload to save the jobs for debugging
					// Copy unfinished jobs from last session into queue
					/*
					if (settings.API.queue.length > 0) {
						THROTTLE.currentRequests = settings.API.queue;
						settings.API.queue = [];
						// Start the first job in the list
						// THROTTLE.tryNext();
					}
					*/

					// Ask the player if they want to run possibly unfinished jobs from last session
					/*
					if (settings.API.running.length > 0) {
						console.log(settings.API.running);
						// TODO Append list of jobs to UNFINISHED with checkboxes
						// TODO User will select desired jobs, and will click "Add to Queue" which will shift the jobs to the front then tryNext()
						// TODO Or the user will click "Ignore" which will start the queue regularly
					}
					*/
				} else {
					// Initiate registration/login
					LOGREG.classList.remove("slideLogregUp");
					LOGREG.classList.add("slideLogregDown");
				}
			} else {
				// TODO Show a display of the time remaining
				Util.notify("Server offline");
				if (confirm("Would you like to auto-reconnect? An attempt will be made every 5 seconds.")) setInterval(launch, 5000);
			}
		})
		.catch(error => {
			if (error.message === "NetworkOffline") {
				Util.notify("Network offline, connection will resume once online.", { "backgroundColor": "red" });
				self.addEventListener("online", launch, { "once": true });
			} else {
				// Regular programming error
				// Util.loggly(error.message)
				console.error(error.message);
			}
		});
};

// Catch the user before they leave the page to ensure they won't break anything
self.addEventListener("beforeunload", event => {
	settings.radio.status = "paused";
	if (THROTTLE.runningRequests.length > 0) {
		event.preventDefault();
		settings.API.running = THROTTLE.runningRequests;
		settings.API.queue = THROTTLE.currentRequests;
		Util.saveToStorage(settings);
		return event.returnValue = "Requests are still running! Leaving now may cause issues!";
	}
});

// Begin once page load is finished
window.addEventListener("load", () => {
	// We'll do a test to ensure we can still mine with at least 3 threads left open for the user
	const maxThreads = Math.max(navigator.hardwareConcurrency - 3, 0);
	if (maxThreads > 1) {
		THREADS_input.setAttribute("max", maxThreads);
		// Set suggested number of threads to be ~50% of allowed (~25% of max)
		THREADS_input.setAttribute("value", maxThreads === 2 ? 1 : Math.round(maxThreads / 2));
		for (let i = 1, option; i <= maxThreads; i++) {
			option = document.createElement("option");
			option.value = i;
			option.label = i;
			TICKMARKS.appendChild(option);
		}
	} else {
		// Hide mining related stuff
		document.getElementById("quarry").style.display = "none";
	}

	// Make all elements marked with a data-coin attribute interact with the QR image placeholder
	const updateQR = event => QR_img.setAttribute("src", `img/qr/${event.target.dataset?.coin ?? event.target.parentNode?.dataset?.coin ?? event.target.parentNode.parentNode.dataset.coin}.png`);
	const elements = document.querySelectorAll("[data-coin]");
	for (const element of elements) {
		element.addEventListener("mouseover", updateQR);
		element.addEventListener("touch", updateQR);
	}

	// Display map before scaling
	MAPWRAP.style.visibility = "visible";
	// Resize the map to fit the screen area
	scaleMap();
	// Hide map until launch
	MAPWRAP.style.visibility = "hidden";

	// Launch Serenity
	launch();
});

/* API Endpoints
 * POST /users/<username>/purchase-orders token=$token shipId=$shipId good=<good> quantity=<###> - Buy goods/fuel

 * GET /game/locations/<systemId> - View data on a specific system
 * GET /game/locations/<systemId>/marketplace - View marketplace data for a system
 * GET /game/systems/<systemId>/locations token=$token type=<type> - Location search

 * GET /game/systems/<symbol>/flight-plans token=$token - View all flight plans in system
 * POST /users/<username>/flight-plans token=$token shipId=$shipId destination=<location> - Sets a flight plan to <location>
 * GET /users/<username>/flight-plans/<flightPlanId> token=$token - View flight plan data

 * POST /users/<username>/sell-orders token=$token shipId=$shipId good=<good> quantity=<###> - Sell goods/fuel

 * POST /game/structures/:structureId/deposit shipId=:shipId good=:goodSymbol quantity=:quantity - Deposit material to a structure

 * POST /users/{username}/warp-jump shipId=:shipId - Jump through warp gate
*/