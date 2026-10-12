# Riders' demo video: the script

The scene-by-scene script for `assets/flyer/demo-riders.mp4`, to agree on
before anything is rendered. Once it is settled, `tools/demo-cuts.js` is
changed to match and the video is re-rendered.

**Rendered.** The motion does the explaining; the words only name the scene.
There are four short captions in the whole video, in English and Tagalog
mixed, and three scenes have no caption at all.

How to read it:

- **Caption** is the one line at the top of the frame.
- **On the phone** is what the real tracker does, tapped through by the
  renderer.
- **Graphics** are the moving parts drawn around the phone. Any words in
  them are labels of one to three words, never sentences.
- Times are from the render, about 48 seconds in all.
- The buses are the flyer's made-up ones. There is no example-screen label
  in this cut (a deliberate decision; the operators' cut keeps it).

## At a glance

| # | Time | Scene | Caption |
|---|------|-------|---------|
| 0 | 0:00–0:03.5 | Cover | Nasaan na ang bus? |
| 1 | 0:03.5–0:12.3 | Where the buses are | *(no caption)* |
| 2 | 0:12.3–0:22.5 | How far is it | Gaano kalayo pa? |
| 3 | 0:22.5–0:25 | Salamat | *(no caption)* |
| 4 | 0:25–0:32.5 | On a bus yourself | Share kung nasaan ang bus |
| 5 | 0:32.5–0:42 | The ticket | *(no caption)* |
| 6 | 0:42–0:48.5 | Close | Buksan ngayon |

Removed since draft 1:
- "Live ang bawat bus". The buses scene now has no caption.
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
- **Graphics:** the dawn view over Taal. The sun comes up and the coach
  drives in.

The longer lede line ("Tingnan kung nasaan ang bus ngayon…") is dropped.
Frame 0 is the group chat's thumbnail, so the board and the caption are on
screen from the first frame.

## 1 · Where the buses are (0:03.5–0:12.3), shown without words

- **Caption:** none.
- **On the phone:**
  1. The livery stripes wipe the cover away and the phone flies in, tilted,
     and settles.
  2. Sped up, the buses run from where they are first seen: 98018 north
     from Gen. Trias towards Kawit, 98104 behind it, 98077 south.
  3. The map zooms in smoothly on Imus and Kawit, where 98018 is, the
     checkpoints and the bus badges keeping their own sizes all the way in.
- **Graphics:**
  - A gold line underlines the web address in the address bar.
  - The **Pinabilis** chip while the buses run.
  - The camera zooms in on the line map at the top. A gold callout,
    **▲ Pa-Ayala**, rides on 98018 on the top line, and a maroon one,
    **▼ Pa-Mendez**, on 98077 on the bottom line.
  - The camera moves down to the map, and a callout reads **Live · 98018**
    on the bus.

## 2 · How far is it (0:12.3–0:22.5)

- **Caption:** Gaano **kalayo pa?**
- **On the phone:**
  1. The phone scrolls to the saved-stop card, taps "Set your stop", types
     "S&R" and picks **S&R Kawit**. While the stop list covers the screen,
     the map is set in close on the last three kilometres.
  2. The card reads "about 5 stops before yours · 3.0 km".
- **Graphics:**
  - The whole phone, low in the frame: the map above the card. A pulsing
    purple ring and a **Stop mo** label on the saved stop at the top of the
    map, a gold ring on bus 98018 at the bottom of it.
  - A flip counter above the phone: **5 stops pa · 3.0 km**.
  - The **Pinabilis** chip while the bus drives up the map to the stop in
    about four seconds. A ping each time it passes a stop, and the counter
    flips with the card: 4, 3, 2, 1.
  - At two stops the LED board slams in with **MALAPIT NA!**, and the card
    turns gold.
  - At the stop, **SAKAY NA!** and a burst at the pin. The card says "Next
    stop is yours."

## 3 · Salamat (0:22.5–0:25), shown without words

No cut from the scene before: the bus that just arrived is the one thanked.

- **Caption:** none.
- **On the phone:** the rider taps bus 98018 at the stop. The popup opens,
  the rider taps **Say salamat**, and the button turns to "Salamat sent".
  The bus's own little "beep beep!" pops up on its badge *(app)*.
- **Graphics:** the tap ripple, and nothing else.

## 4 · On a bus yourself (0:25–0:32.5)

The background turns to night.

- **Caption:** Share **kung nasaan ang bus**
- **On the phone:** the rider taps "I'm on the bus", then Northbound, types
  98019 and taps Start. The sharing tab goes dark.
- **Graphics:** the camera closes in on the line map, and a callout reads
  **Lalabas dito kapag nag-share ka** on the green-ringed bus.

## 5 · The ticket (0:32.5–0:42), shown without words

- **Caption:** none.
- **Graphics:** the **Pinabilis** chip, and the whole trip driven along the
  strip in about four and a half seconds, Mendez through Amadeo, Gen.T,
  Imus, Kawit and PITX to Ayala, with no skip. The pages' clock runs the
  trip's real length, so the ticket says 2 h 31 min.
- **On the phone:** the rider taps Stop, and the camera closes in on the
  salamat ticket: Mendez → Ayala, "3 riders said salamat", and the BUONG
  RUTA stamp.

## 6 · Close (0:42–0:48.5)

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

- Sped-up stretches carry the Pinabilis chip.
- The disclaimer stays in the close.
- No minutes or arrival times anywhere.
- The four safety points left with the "Libre, walang ads" card. The
  disclaimer is now the only reassurance in the video. That is allowed, but
  worth knowing.

---

## Narration (draft 1)

For a voice recorded over the rendered video. The times are those of the
51-second cut before the buses moved, and need re-timing to the current one.
They came from that cut's own sound track: each tap, wipe and board-slam is a
cue on the frame where it happens. Conversational Taglish runs about 2.3
words a second, so each line is sized to leave room around the beats it
lands on. ▶ marks a line to say exactly on a beat.

| Time | On screen | Narration |
|------|-----------|-----------|
| 0:00–0:03.4 | Cover: "Nasaan na ang bus?" | Nasaan na ang bus? *(beat)* Alamin bago ka pa lumabas ng bahay. |
| 0:03.4–0:13 | Wipe; the phone flies in; Pa-Ayala and Pa-Mendez arrows (0:06.6); Live · 98018 (0:10) | Buksan lang ang link — walang app, walang account. Bawat bilog, isang bus, live — galing mismo sa mga nasa bus. |
| 0:13–0:22.5 | Saving S&R Kawit, then "Gaano kalayo pa?" (0:15.8) and the counter starting (0:17.8) | I-save ang stop mo, at makikita mo kung ilang stop pa ang layo ng bus, at ilang kilometro. |
| 0:22.5 | MALAPIT NA! slams in | ▶ Malapit na… |
| 0:24.9 | SAKAY NA! slams in | ▶ Sakay na! |
| 0:27.5–0:31.4 | Tap the bus (0:28.8), Say salamat (0:29.8), chime (0:30.1) | Isang tap: salamat sa nag-share. |
| 0:31.4–0:39.3 | Night: "Share kung nasaan ang bus" (0:32.1); "Lalabas dito kapag nag-share ka" (0:37.3) | Ikaw naman ang nasa bus? Isang tap lang, at kita na ng lahat ng naghihintay kung nasaan ang bus. |
| 0:39.3–0:44 | "Makalipas ang 2 oras"; Stop (0:40.6); the ticket | Pagbaba mo, i-tap ang Stop — may ticket ka pa. |
| 0:44–0:50.6 | Close: link, QR, "I-post sa group chat!" | I-scan o i-type ang link, at i-post sa group chat ninyo. Libre, at hindi ito opisyal na app ng kompanya. |

Every line stays inside what the flyer already says. The narration never
mentions minutes or arrival times; it says "ilang stop" and "ilang
kilometro" because that is what the card counts. The disclaimer is in the
last line as well as on screen.
