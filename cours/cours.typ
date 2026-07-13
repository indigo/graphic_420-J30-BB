#import "@preview/theorion:0.4.1": *
#import cosmos.rainbow: *
#show: show-theorion

#set document(
  author: ("Richard Rispoli"),
  title: [Graphisme dans le jeu vidéo],
)

#show title: set align(right)
#show title: set block(below: 1.2em)
#show title: set text(weight: "bold", size: 1.2em, fill: rgb("#406372"))

#set page(
  paper: "us-letter",
  margin: 2cm,
  header: align(right + horizon, "Programmation Graphique (420-J30-BB)"),
)

#set text(font: "Georgia", lang: "fr", size: 11pt)
#show heading: set text(weight: "bold", size: 1.1em, fill: rgb("#005F87"))

#title()

#outline(
  title: [Table des matières],
  indent: 1.5em,
  depth: 2,
)

#pagebreak()

#include "session01.typ"

#pagebreak()

#include "session02.typ"

#pagebreak()

#include "session03.typ"

#pagebreak()

#include "session04.typ"

#pagebreak()

#include "session05.typ"

#pagebreak()

#include "session06.typ"

#pagebreak()

#include "session07.typ"

#pagebreak()

#include "session08.typ"

#pagebreak()

#include "session09.typ"

#pagebreak()

#include "session10.typ"

#pagebreak()

#include "session11.typ"

#pagebreak()

#include "session12.typ"
