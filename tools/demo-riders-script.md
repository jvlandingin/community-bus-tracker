# Riders' demo video: the script

The scene-by-scene script for `assets/flyer/demo-riders.mp4`, to agree on
before anything is rendered. Once it is settled, `tools/demo-cuts.js` is
changed to match and the video is re-rendered.

**Draft 2.** The motion does the explaining; the words only name the scene.
Each scene gets one caption of three to five words where possible, in
English and Tagalog mixed. Two scenes have no caption at all.

How to read it:

- **Caption** is the one line at the top of the frame.
- **On the phone** is what the real tracker does, tapped through by the
  renderer.
- **Graphics** are the moving parts drawn around the phone. Any words in
  them are labels of one to three words, never sentences.
- Times are estimates for the shorter cut, about 45 seconds in all.
- Every frame that shows the tracker carries **"Halimbawa · example
  screen"** at the foot. The buses are the flyer's made-up ones.

## At a glance

| # | Time | Scene | Caption |
|---|------|-------|---------|
| 0 | 0:00–0:03.5 | Cover | Nasaan na ang bus? |
| 1 | 0:03.5–0:10 | Where the buses are | Live ang bawat bus |
| 2 | 0:10–0:21 | How far is it | Easily monitor kung gaano kalayo pa |
| 3 | 0:21–0:28 | Salamat | *(no caption)* |
| 4 | 0:28–0:34 | On a bus yourself | Tap to share kung nasaan na ang bus |
| 5 | 0:34–0:39 | The ticket | *(no caption)* |
| 6 | 0:39–0:45 | Close | Buksan ngayon |

Removed since draft 1:
- "Walang app. Walang account." The phone now flies in straight from the
  cover.
- "Bibilangin ng app." The countdown stays as part of scene 2.
- The "Libre, walang ads" card.
- The captions on the salamat and ticket scenes. Those scenes stay, shown
  with no words.

---

## 0 · Cover (0:00–0:03.5)

A full-frame card in maroon, with no phone.

- **Board:** the dot-matrix route board, MENDEZ / TAGAYTAY ⇄ ONE AYALA.
- **Caption:** Nasaan na **ang bus?**
- **Small print at the foot:** Halimbawa lang ang mga bus
- **Graphics:** the dawn view over Taal. The sun comes up and the coach
  drives in.

The longer lede line ("Tingnan kung nasaan ang bus ngayon…") is dropped.
Frame 0 is the group chat's thumbnail, so the board and the caption are on
screen from the first frame.

## 1 · Where the buses are (0:03.5–0:10)

- **Caption:** Live ang **bawat bus**
- **On the phone:**
  1. The livery stripes wipe the cover away and the phone flies in, tilted,
     and settles.
  2. The map pans in to Imus and Kawit, where bus 98018 is.
- **Graphics:**
  - A gold line underlines the web address in the address bar.
  - The camera zooms in on the line map at the top.
  - A gold callout reads **▲ Pa-Ayala** on the top line, then a maroon one
    reads **▼ Pa-Mendez** on the bottom line.
  - The camera moves down to the map, and a callout reads **Live · 98018**
    on the bus.

## 2 · How far is it (0:10–0:21)

- **Caption:** Easily monitor **kung gaano kalayo pa**
- **On the phone:**
  1. The phone scrolls to the saved-stop card, taps "Set your stop", types
     "S&R" and picks **S&R Kawit**.
  2. The card reads "about 5 stops before yours · 3.0 km".
- **Graphics:**
  - The camera closes in on the card, and a flip counter appears:
    **5 stops · 3.0 km**.
  - A **Pinabilis** chip ("sped up") shows while the bus covers the last
    three kilometres in about eight seconds.
  - The counter flips down with the card: 4, 3, 2.
  - At two stops the LED board slams in with **MALAPIT NA!**, and the card
    turns gold.
  - At one stop the board slams in with **SAKAY NA!** and a burst. The card
    says "Next stop is yours."

> **About "With built-in timer":** this half of your line is left out on
> purpose. The app deliberately never shows minutes or an arrival time. It
> keeps no record of past trips to estimate one from, and CLAUDE.md treats
> any wording that implies one as a bug. What the app counts down is stops
> and kilometres. If you want a second line, "Built-in countdown" or
> "Live ang bilang ng stops" says what it actually does.

## 3 · Salamat (0:21–0:28), shown without words

- **Caption:** none.
- **On the phone:** the rider taps bus 98018 on the map. The popup opens,
  and the rider taps **Say salamat**.
- **Graphics:**
  - A second phone slides in beside the first. The labels above the two
    phones read **Ikaw** and **Nasa bus 98018**.
  - Sampaguita fly from the rider's phone to the sharer's.
  - The sharer's screen shows "1 rider said salamat", and a green ring
    pulses round it.

The labels are the one bit of text left, because without them the second
phone is a stranger. They could go too, if the flowers carry it.

## 4 · On a bus yourself (0:28–0:34)

The background turns to night.

- **Caption:** Tap to share **kung nasaan na ang bus**
- **On the phone:** the rider taps "I'm on the bus", then Northbound, types
  98019 and taps Start. The sharing tab goes dark.
- **Graphics:** the camera closes in on the line map, and a callout reads
  **Ito ang bus mo** on the green-ringed bus.

This caption is eight words, which is over the three-to-five aim. A
four-word version would be **"Tap. Live na ang bus."**

## 5 · The ticket (0:34–0:39), shown without words

- **Caption:** none.
- **Graphics:** a clock chip reads **Makalipas ang 2 oras**, and the trip
  jumps ahead. This chip has to stay: the video's own rule is that a skipped
  stretch says so.
- **On the phone:** the rider taps Stop, and the camera closes in on the
  salamat ticket: Mendez → Ayala, "3 riders said salamat", and the BUONG
  RUTA stamp.

## 6 · Close (0:39–0:45)

- **Board:** the route board, with a scanline passing over it.
- **Caption:** Buksan ngayon
- **Graphics:** the link community-bus-tracker.netlify.app types itself out,
  then the QR code pops in. Below them is **I-post sa group chat!**, and the
  coach drives across the bottom and off.
- **Disclaimer (small print, required):** **Hindi ito opisyal.** Not
  affiliated with, run by, or endorsed by Wonderful Transport. Kapag walang
  nag-share, walang bus sa mapa.

The "I-scan ang QR o i-type ang link…" line is dropped.

---

## Possible additions

- **BABABA NA!** The saved-stop card now has a riding mode from main: on
  board it follows your own bus, and the card says Malapit na! and then
  Bababa na!. In scene 4, the LED board could count down to **BABABA NA!**,
  so the video pairs catching the bus (SAKAY NA!) with getting off it, and
  still uses no caption.

## Rules the script still keeps

- The example-screen label is on every frame that shows the tracker.
- The skip says so.
- The disclaimer stays in the close.
- No minutes or arrival times anywhere.
- The four safety points left with the "Libre, walang ads" card. The
  disclaimer is now the only reassurance in the video. That is allowed, but
  worth knowing.
