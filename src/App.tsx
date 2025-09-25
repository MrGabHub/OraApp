import React from "react";
import Avatar from "./components/avatar";
import "./index.css";

export default function App() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "white",
      }}
    >
      <Avatar />
    </div>
  );
}
