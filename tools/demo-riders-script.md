# Riders' demo video: the script

The scene-by-scene script for `assets/flyer/demo-riders.mp4`, written out so
the words and the order can be changed before anything is rendered. Times
are from the last render (66 seconds, portrait, silent). Once this is agreed,
`tools/demo-cuts.js` is changed to match and the video re-rendered.

How to read it:

- **Kicker / Headline / Sub** are the words at the top of the frame. A
  numbered kicker shows its number in a dot.
- **On the phone** is what the real tracker does, tapped through by the
  renderer. **Graphics** are the moving parts drawn around the phone.
- Where a line comes from: *(flyer)* is the flyer's own wording, *(app)* is
  what the tracker itself prints, and *(new)* was written for the video.
  New lines are the ones to check first.
- Every frame that shows the tracker carries the label **"Halimbawa ·
  example screen"** at the foot. The buses are the flyer's made-up ones.

## At a glance

| # | Time | Scene | Headline |
|---|------|-------|----------|
| 0 | 0:00–0:05 | Cover | Nasaan na ang bus? |
| 1 | 0:05–0:08.5 | Open the link | Walang app. Walang account. |
| 2 | 0:08.5–0:16 | Where the buses are | Bawat bilog, isang bus. |
| 3 | 0:16–0:20.5 | Save your stop | Ilang stop pa bago dumating? |
| 4 | 0:20.5–0:32 | The bus coming | Bibilangin ng app. |
| 5 | 0:32–0:41 | Salamat | Isang tap mo, ramdam ng nag-share. |
| 6 | 0:41–0:48.5 | On a bus yourself | I-share ang lokasyon ng bus. |
| 7 | 0:48.5–0:54 | The ticket | I-tap ang Stop. May ticket ka pa. |
| 8 | 0:54–0:59 | Why it is safe | Libre, walang ads. |
| 9 | 0:59–1:06 | Close | Buksan ngayon |

---

## 0 · Cover (0:00–0:05)

A full-frame card in maroon, no phone.

- **Board:** the dot-matrix route board, MENDEZ / TAGAYTAY ⇄ ONE AYALA.
- **Eyebrow:** WONDERFUL TRANSPORT · COMMUNITY LIVE TRACKER · UNOFFICIAL *(app's header)*
- **Headline:** Nasaan na **ang bus?** *(flyer)*
- **Lede:** Tingnan kung nasaan ang bus ngayon — bago ka pa lumabas ng bahay. *(flyer)*
- **Small print at the foot:** Halimbawa lang ang mga bus sa video na ito *(new)*
- **Graphics:** the view of Taal from the ridge at dawn; the sun comes up and
  the coach drives in with its headlamp on.

Frame 0 is the thumbnail a group chat shows, so the board and the headline
are on screen from the very first frame.

## 1 · Open the link (0:05–0:08.5)

- **Kicker:** ① Buksan ang link *(flyer)*
- **Headline:** Walang app. Walang **account.** *(flyer)*
- **Sub:** Walang ida-download. Bubukas agad sa browser mo, sa kahit anong phone. *(flyer)*
- **On the phone:** the tracker as it opens, showing four buses.
- **Graphics:** the livery stripes wipe across; the phone flies in tilted and
  settles; a gold line underlines the web address in its address bar.

## 2 · Where the buses are (0:08.5–0:16)

- **Kicker:** ② Tingnan kung nasaan ang bus *(new)*
- **Headline:** Bawat bilog, **isang bus.** *(new)*
- **Sub:** Live ang posisyon, galing sa mga nasa bus mismo. *(new; the flyer says "Galing sa mga volunteer ang posisyon")*
- **On the phone:** the map pans in to Imus and Kawit, where 98018 is.
- **Graphics:**
  - The camera zooms in on the line map at the top.
  - A gold callout reads **▲ Papuntang Ayala** on the top line, then a maroon
    one reads **▼ Papuntang Mendez** on the bottom line *(new)*.
  - The camera moves down to the map. A callout reads **Live · 98018** on the
    bus *(new)*.

## 3 · Save your stop (0:16–0:20.5)

- **Kicker:** ③ I-save ang stop mo *(new)*
- **Headline:** Ilang stop pa **bago dumating?** *(new)*
- **On the phone:**
  1. The phone scrolls down to the saved-stop card and taps "Set your stop".
  2. It types "S&R" and picks **S&R Kawit**.
  3. The card reads "about 5 stops before yours · 3.0 km" *(app)*.

## 4 · The bus coming (0:20.5–0:32)

- **Kicker:** Malapit na ba? *(new)*
- **Headline:** Bibilangin ng app. *(new)*
- **Graphics:**
  - The camera closes in on the card. A flip counter beside the headline
    reads **5 stops pa · 3.0 km**.
  - At 0:22.5 a chip in the corner says **Pinabilis** ("sped up"). The bus
    covers the last three kilometres in about eight seconds.
  - The counter flips down in step with the card: 4, 3, 2.
  - At two stops, the LED board slams in with **MALAPIT NA!** and the card
    turns gold with the same words *(app)*.
  - At one stop, the board slams in with **SAKAY NA!** with a burst. The card
    says "Next stop is yours. Get ready to wave it down." *(app)*

## 5 · Salamat (0:32–0:41)

- **Kicker:** ④ Mag-salamat *(new)*
- **Headline:** Isang tap mo, **ramdam ng nag-share.** *(new)*
- **On the phone:** the rider taps bus 98018 on the map. The popup opens with
  the town line ("Kawit, where independence was declared on 12 June 1898")
  and the rider taps **Say salamat**.
- **Graphics:**
  - A second phone slides in: the person sharing from bus 98018. The labels
    above the two phones read **Ikaw** and **Nasa bus 98018** *(new)*.
  - Sampaguita fly from the rider's phone to the sharer's.
  - A green ring goes round **"1 rider said salamat"** on the sharer's screen
    *(app)*.

## 6 · On a bus yourself (0:41–0:48.5)

The background turns to night.

- **Kicker:** ⑤ Nasa bus ka? *(new)*
- **Headline:** I-share ang lokasyon **ng bus.** *(new)*
- **Sub:** I-tap ang “I'm on the bus”, piliin ang direksyon. Puwede mong itigil anumang oras. *(new)*
- **On the phone:** the rider taps "I'm on the bus", then Northbound, types
  98019, and taps Start. The sharing tab goes dark.
- **Graphics:** the camera closes in on the "Everyone can see this" line map.
  A callout reads **Ito ang bus mo** on the green-ringed bus *(new)*.

## 7 · The ticket (0:48.5–0:54)

- **Kicker:** Pagbaba mo *(new)*
- **Headline:** I-tap ang Stop. May **ticket** ka pa. *(new)*
- **Graphics:**
  - A clock chip says **Makalipas ang 2 oras** ("2 hours later") *(new)*, and
    the trip jumps ahead.
  - Three riders the video does not show say salamat.
- **On the phone:** the rider taps Stop, and the camera closes in on the
  salamat ticket. It shows Mendez → Ayala, 2 h 26 min on the map, "3 riders
  said salamat" and the BUONG RUTA stamp *(app)*.

## 8 · Why it is safe (0:54–0:59)

A full-frame card in maroon. The example-screen label goes away here, because
the tracker is no longer on screen.

- **Eyebrow:** Bakit ito ligtas gamitin *(flyer)*
- **Headline:** Libre, **walang ads.** *(flyer)*
- **Four rows, each ticked as it pops in:**
  1. **Walang app.** Browser lang. Walang i-i-install. *(flyer)*
  2. **Walang account.** Walang pangalan, walang number, walang email. *(flyer)*
  3. **Hindi ka nito sinusundan.** Kung nanonood ka lang, hindi hinihingi ang location mo. *(flyer)*
  4. **Walang itinatagong history ng biyahe.** Ang huling posisyon lang ang naka-imbak, at nabubura pagtapos. *(flyer, shortened)*

## 9 · Close (0:59–1:06)

- **Board:** the route board, with a scanline passing over it.
- **Eyebrow:** Buksan ngayon *(new)*
- **Link:** community-bus-tracker.netlify.app, typed out letter by letter,
  then the QR code pops in with a scan line.
- **Lede:** I-scan ang QR o i-type ang link. Gumagana sa kahit anong phone. *(flyer)*
- **Call to action:** I-post sa group chat ninyo! *(new)*
- **Disclaimer:** **Hindi ito opisyal.** Not affiliated with, run by, or
  endorsed by Wonderful Transport. Galing sa mga volunteer ang posisyon.
  Kapag walang nag-share, walang bus sa mapa — hindi ibig sabihin walang bus. *(flyer)*
- **Graphics:** the coach drives across the bottom and off.

---

## New since the last render (main, 10 October)

The saved-stop card now has a **riding mode**. On board, it follows your own
bus to the stop you get off at, rather than the nearest bus coming. A sharer's
own bus is picked automatically; anyone else taps **I'm on this bus** in the
bus's popup. The card then says **Malapit na!** and **Bababa na!** with "Get
ready to get off", and while sharing, the card also shows on the sharing tab.

The video does not show any of this yet. Two ways it could:

- In scene 6 or 7, keep the saved stop (or save the stop you get off at) and
  let the card count down to **BABABA NA!** on the LED board. This mirrors
  scene 4's SAKAY NA!, so the two halves of the video rhyme: waiting for the
  bus, and getting off it.
- In scene 5, the popup now also shows **I'm on this bus**. A rider who is
  not sharing could tap it to follow the bus they boarded.

## Rules the script has to keep

- Every frame showing the tracker carries the example-screen label.
- Sped-up or skipped stretches say so.
- The disclaimer stays in the close.
- No caption claims minutes or an arrival time.
- No caption claims anything the flyer or the briefing does not.
