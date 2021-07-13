class Util {
	static #CRYPTO = (window.crypto || window.msCrypto)
	static #conversion = {
		"M": 1000,
		"D": 500,
		"C": 100,
		"L": 50,
		"X": 10,
		"V": 5,
		"I": 1
	}
	constructor(){}
	// Build a blob from given data, create a link, and click it to initiate a download
	static saveAs = (data, filename = "untitled") => {
		switch (typeof data) {
			case "string":
				data = new Blob([data], {type: "text/plain;charset=utf-8"})
				break
			case "object":
				if (data instanceof WeakMap || data instanceof WeakSet)
					throw Error("WeakSet and WeakMap cannot be enumerated, thus cannot be saved")
				if (Array.isArray(data)) data = new Blob([data], {type: "text/plain;charset=utf-8"})
				if (data instanceof Set) data = new Blob([[...data]], {type: "text/plain;charset=utf-8"})
				if (data instanceof Map) {
					data = [...data].map(x => {
						let [key, value] = [...x]
						switch (typeof value) {
							case "object":
								return `${key} = ${JSON.stringify(value)}`
							default:
								return `${key} = ${value}`
						}
					}).join("\r\n")
					data = new Blob([data], {type: "text/plain;charset=utf-8"})
				}
				if (!data.arrayBuffer) data = new Blob([JSON.stringify(data)], {type: "application/json"})
				break
			default:
				throw Error("Data type not supported")
		}
		const url = window.URL.createObjectURL(data)
		const a = document.createElement("a")
		a.download = filename
		a.href = url
		a.style.display = "none"
		document.body.appendChild(a)
		a.click()
		a.remove()
		window.URL.revokeObjectURL(url)
	}

	// Generate a random number within the range of [0,1) via 32-bit math
	static random = () => Util.#CRYPTO.getRandomValues(new Uint32Array(1))[0] / (0xffffffff + 1)

	// Generate a random identifier
	static uuid = () => {
		let h = [], r = Util.#CRYPTO.getRandomValues(new Uint8Array(16))
		for (let i = 0; i < 256; i++) h[i] = (i < 16 ? '0' : '') + (i).toString(16)
		return (
			h[r[0]] + h[r[1]] + h[r[2]] + h[r[3]] + "-" +
			h[r[4]] + h[r[5]] + "-" +
			(h[r[6]] & 0x0f | 0x40) + h[r[7]] + "-" +
			(h[r[8]] & 0x3f | 0x80) + h[r[9]] + "-" +
			h[r[10]] + h[r[11]] + h[r[12]] + h[r[13]] + h[r[14]] + h[r[15]]
		)
	}

	// Send data to remote logging service in order to report bugs for users
	static loggly = async msg => {
		await fetch("http://logs-01.loggly.com/inputs/e82b5603-872f-47de-b6ce-5dfcbbc94124/tag/http/", {
			method: type,
			body: typeof msg === "string" ? msg : JSON.stringify(msg),
			headers: {
				"Content-Type": typeof msg === "string" ? "text/plain" : "application/json"
			}
		})
	}

	static romanToInt = input => {
		const roman = input.split(/(?:)/), inputLength = input.length

		let total = 0
		for (let i = 0, current, next; i < inputLength; i++) {
			current = Util.#conversion[roman[i]]
			next = Util.#conversion[roman[i + 1]]
			i++
			if (current < next) {
				total += next - current
				continue
			}
			total += current
		}
		return total
	}

	// Wait for a given amount of time
	static sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

	// Calculate distance between two points in a 2D or 3D space
	static v2distance = (a, b) => Math.sqrt(((b.x - a.x) ** 2) + ((b.y - a.y) ** 2)) // Vec2
	static v3distance = (a, b) => Math.sqrt(((b.x - a.x) ** 2) + ((b.y - a.y) ** 2) + ((b.z - a.z) ** 2)) // Vec3

	//TODO Update to v3distance when map is updated to 3D coordinates
	static fuelCost = (fromLocation, toLocation, type, shipClass) => {
		/*let planetCost = 1; // Fuel cost to escape a planet
		if (type === "PLANET") {
			switch (shipClass) {
				case "":
					break
				default:
			}
		}*/
		Math.round(Util.v2distance(fromLocation, toLocation) / 4) + (type === "PLANET" ? 1 : 0) + Util.romanToInt(shipClass.replace("MK-", ""))
	}

	static flightTime = (a, b, speed) => Math.round((2 / speed) * Math.round(Util.v2distance(a, b)) + 60)

	// Purchase Qty: Math.min(credits/price_per_unit, market_available, space_available/volume_per_unit)
	// Prompt the user for a value with desired minimum length (default is 1)
	static promptLoop = (str, minLength = 1) => {
		let result
		do {
			result = prompt(str)
			if (result === null) return null
		} while (result.trim().length < minLength);
		return result
	}

	// Returns a number reformatted as a string as follows (ex: 1000000 = 1,000,000)
	//static formatCredits = cred => [...([...`${cred}`].reverse().join("").replace(/\d{3}/g, "$&,"))].reverse().join("").replace(/^,/, "")
	static formatCredits = cred => cred.toLocaleString();

	static notify = (msg, opts) => {
		const NOTIFIER = document.getElementById("notifier")
		if (NOTIFIER.classList.contains("slideNotifier")) {
			msgQueue.push({m: msg, o: opts})
			return;
		}
		NOTIFIER.textContent = msg.toUpperCase()
		if (opts) {
			NOTIFIER.oldStyle = Object.assign({}, NOTIFIER.style)
			for (let opt in opts)
				NOTIFIER.style[opt] = opts[opt]
		}
		NOTIFIER.classList.add("slideNotifier")
	}

	// Helper to save player data
	static saveToStorage = data => localStorage.setItem("STA-Serenity", JSON.stringify(data))
	static saveToFile = data => Util.saveAs(data, "STA-Serenity")
}