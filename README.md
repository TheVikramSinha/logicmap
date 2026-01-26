# ❖ LogicMap
> **A Professional, Lightweight Database Schema Visualizer.** > *Design, visualize, and export complex database relationships with zero friction.*

[![Live Demo](https://img.shields.io/badge/Live-Demo-2563eb?style=for-the-badge&logo=googlechrome&logoColor=white)](https://thevikramsinha.github.io/logicmap)
[![Made with Vanilla JS](https://img.shields.io/badge/Made%20with-Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)]()

---

![LogicMap Screenshot](logicmap.png)

## 📖 About
**LogicMap** is a browser-based Entity Relationship Diagram (ERD) tool designed for developers who need speed and clarity. Unlike heavy enterprise tools, LogicMap runs entirely in the browser using pure Vanilla JavaScript—no frameworks, no backend, and no lag.

It features an **infinite canvas**, **smart orthogonal routing** (grid lines), and a unique **"Chain Highlighting"** system that lets you trace data flow across complex schemas instantly.

## ✨ Key Features

* **⚡ Smart Import Engine:** Paste raw schema text (e.g., `id int, name string`) to auto-generate tables instantly.
* **🕸️ Orthogonal Grid Routing:** No more "spaghetti lines." Relationships are drawn with clean, professional 90-degree stepped lines.
* **🔍 Infinite Canvas:** Seamlessly pan (`Space + Drag`) and zoom (`Mouse Wheel`) to manage schemas with hundreds of tables.
* **💡 Chain Highlighting:** Click any column to instantly light up its entire relationship chain, dimming unrelated tables for focus.
* **📤 High-Fidelity Export:** Generate a standalone, read-only HTML snapshot of your diagram. Perfect for sharing with clients or printing to vector PDFs.
* **💾 Local Persistence:** Save and load your projects as `.json` files. Your data never leaves your device.
* **↩️ Undo/Redo:** Full history support (`Ctrl + Z`).

## 🚀 Quick Start

### Online
Visit the live demo: **[https://thevikramsinha.github.io/logicmap](https://thevikramsinha.github.io/logicmap)**

### Local Installation
Since LogicMap is dependency-free, you don't need `npm` or `build` steps.

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/thevikramsinha/logicmap.git](https://github.com/thevikramsinha/logicmap.git)
    ```
2.  **Open it:**
    Simply double-click `index.html` in your browser.

## 🛠️ How to Use

### 1. Creating Tables
* **Manual:** Click `+ New Table`, name it, and add columns with specific types (String, Int, Bool, etc.).
* **Smart Import:** Click `Smart Import` and paste a text block like this:
    ```text
    id int
    username string
    email string
    is_active boolean
    ```

### 2. Building Relationships
1.  Use the **Right Sidebar**.
2.  Select a **Source Table** and a **Target Table**.
3.  Click the columns you want to link.
4.  Choose **Link 1:1** or **Link 1:N**.
5.  The line creates itself automatically.

### 3. Editing & Deleting
* **Edit:** Click the ✎ (Pencil) icon on a table header to add/remove columns.
* **Delete:** Click the × (Cross) icon. *Note: This will also remove connected relationships.*

### 4. Exporting
* Click the **Export** button to download a `LogicMap_Snapshot.html`.
* Open this file to view a clean, UI-free version of your schema.
* Press `Ctrl + P` (Print) on that snapshot to save a perfect PDF.

## 🤝 Contributing
Contributions are welcome! If you have ideas for features (like SQL Export or Dark Mode Canvas), feel free to fork the repo and submit a Pull Request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 👤 Author

**Vikram Kumar Sinha**
* GitHub: [@thevikramsinha](https://github.com/thevikramsinha)

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
