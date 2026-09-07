import { render } from "preact";
import { App } from "./ui/App";
import "./style.css";
import "./game.css";
import "./rpg.css";
import "./ui/readability.css";
render(<App />, document.getElementById("app")!);
