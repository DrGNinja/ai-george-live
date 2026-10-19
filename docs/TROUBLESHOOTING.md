# Troubleshooting

## "This site can't be reached · ERR_CONNECTION_RESET"

The site is up; something on the computer or network is cutting the connection. Most often it's antivirus "web protection" (AVG, Avast, Norton, McAfee, ESET, Kaspersky), which can block new sites it hasn't seen before.

- **Check:** does the link open on a phone using cellular data? If yes, the laptop or its network is the cause.
- **AVG / Avast:** open the antivirus → **Menu → Settings → General → Exceptions → Add exception**, enter `https://drgninja.github.io/*`, save, then reload Chrome. Don't switch the antivirus off.
- **Other antivirus:** add the same address as a trusted or allowed website in its web-protection settings.
- **VPN or school network:** try without the VPN, or on another network.

## Camera or microphone "Blocked"

Use **Test camera & microphone** on the start page. It explains the fix for Chrome, Mac and Windows. In short: click the icon at the left of the address bar, allow Camera and Microphone, then reload.

## "This browser can't run the live coach"

The live coach needs Chrome or Edge on a laptop or desktop with WebGPU. Phones and older computers can use the text coach linked on the start page.

## The first start is slow

The first visit downloads the AI models (about 1–2.5 GB) and caches them. Use good Wi-Fi and keep the tab open. Later visits start in seconds. Choose **Light** or **Tiny** model size on older laptops.
