/**
 * Professional Logic Simulator Core
 * Refactored for maintainability and reliability.
 */

class LogicNode {
    constructor(type, id) {
        this.type = type;
        this.id = id;
        this.inputs = [];
        this.outputs = [];
        this.isOn = false;
    }

    addInput(node) {
        if (!this.inputs.includes(node)) {
            this.inputs.push(node);
        }
    }

    addOutput(node) {
        if (!this.outputs.includes(node)) {
            this.outputs.push(node);
        }
    }

    removeConnection(nodeId) {
        this.inputs = this.inputs.filter(n => n.id !== nodeId);
        this.outputs = this.outputs.filter(n => n.id !== nodeId);
    }

    evaluate() {
        const inputValues = this.inputs.map(n => n.isOn);
        let newState = this.isOn;

        switch (this.type) {
            case 'and':
                newState = inputValues.length > 0 && inputValues.every(v => v);
                break;
            case 'or':
                newState = inputValues.some(v => v);
                break;
            case 'not':
                newState = inputValues.length > 0 ? !inputValues[0] : false;
                break;
            case 'nand':
                newState = !(inputValues.length > 0 && inputValues.every(v => v));
                break;
            case 'nor':
                newState = !inputValues.some(v => v);
                break;
            case 'xor':
                newState = inputValues.reduce((acc, v) => acc ^ v, 0) === 1;
                break;
            case 'output':
                newState = inputValues.length > 0 ? inputValues[0] : false;
                this.updateUI();
                break;
            case 'input':
                // State managed by user interaction
                break;
        }

        if (newState !== this.isOn || this.type === 'input') {
            this.isOn = newState;
            this.propagate();
            this.updateUI();
        }
    }

    propagate() {
        this.outputs.forEach(node => node.evaluate());
    }

    updateUI() {
        const cell = document.getElementById(this.id);
        if (!cell) return;

        if (this.type === 'output') {
            const img = this.isOn ? '1out.png' : '0out.png';
            cell.style.backgroundImage = `url(images/${img})`;
        } else if (this.type === 'input') {
            const img = this.isOn ? 'on.png' : 'off.png';
            cell.style.backgroundImage = `url(images/${img})`;
        }
    }
}

class CircuitManager {
    constructor(gridContainer, svgContainer) {
        this.gridContainer = gridContainer;
        this.svgContainer = svgContainer;
        this.nodes = new Map(); // id -> LogicNode
        this.lines = [];
        this.undoStack = [];
        this.selectedOutput = null;
        this.isDeleting = false;
        
        this.gateImages = {
            and: 'images/and.png',
            or: 'images/or.png',
            not: 'images/not.png',
            nand: 'images/nand.png',
            nor: 'images/nor.png',
            xor: 'images/xor.png',
            input: 'images/off.png',
            output: 'images/0out.png'
        };
    }

    initGrid(size = 225) {
        this.gridContainer.innerHTML = '';
        for (let i = 0; i < size; i++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.id = `cell-${i}`;
            cell.addEventListener('click', (e) => this.handleCellClick(cell, e));
            this.gridContainer.appendChild(cell);
        }
    }

    handleCellClick(cell, event) {
        if (this.isDeleting) {
            this.removeElement(cell.id);
            return;
        }

        if (this.currentPlacementType && !cell.classList.contains('has-image')) {
            this.addElement(cell.id, this.currentPlacementType);
            this.currentPlacementType = null;
        }
    }

    addElement(cellId, type, state = null) {
        const cell = document.getElementById(cellId);
        if (!cell || cell.classList.contains('has-image')) return;

        const node = new LogicNode(type, cellId);
        if (state !== null) node.isOn = state;
        
        this.nodes.set(cellId, node);
        cell.node = node;
        cell.classList.add('has-image');
        cell.style.backgroundImage = `url(${this.gateImages[type]})`;

        // Add Points
        this.setupPoints(cell, type);

        if (type === 'input') {
            cell.addEventListener('click', () => {
                if (!this.isDeleting) {
                    node.isOn = !node.isOn;
                    node.evaluate();
                    node.updateUI();
                }
            });
        }

        this.undoStack.push({ action: 'add', cellId, type });
        node.updateUI();
        return node;
    }

    setupPoints(cell, type) {
        // Clear existing
        cell.querySelectorAll('.gate-point').forEach(p => p.remove());

        if (type !== 'input') {
            this.createPoint(cell, 'input-point1');
            if (!['not', 'output'].includes(type)) {
                this.createPoint(cell, 'input-point2');
            }
        }

        if (type !== 'output') {
            this.createPoint(cell, 'output-point');
        }
    }

    createPoint(cell, className) {
        const point = document.createElement('div');
        point.classList.add('gate-point', className);
        cell.appendChild(point);

        point.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handlePointClick(point, className.includes('output'));
        });
    }

    handlePointClick(point, isOutput) {
        const cell = point.parentElement;
        const nodeId = cell.id;

        if (isOutput) {
            this.selectedOutput = { nodeId, point };
            point.classList.add('selected');
        } else if (this.selectedOutput) {
            this.connect(this.selectedOutput.nodeId, nodeId);
            this.selectedOutput.point.classList.remove('selected');
            this.selectedOutput = null;
        }
    }

    connect(fromId, toId) {
        const fromNode = this.nodes.get(fromId);
        const toNode = this.nodes.get(toId);

        if (fromNode && toNode && fromId !== toId) {
            fromNode.addOutput(toNode);
            toNode.addInput(fromNode);
            toNode.evaluate();

            this.drawConnection(fromId, toId);
            this.undoStack.push({ action: 'connect', fromId, toId });
        }
    }

    drawConnection(fromId, toId) {
        const fromCell = document.getElementById(fromId);
        const toCell = document.getElementById(toId);
        if (!fromCell || !toCell) return;

        const fromPoint = fromCell.querySelector('.output-point');
        const toPoints = toCell.querySelectorAll('[class*="input-point"]');
        
        // Find an available input point (closest or first)
        const toPoint = toPoints[0]; // Simplified for now

        const start = this.getPointCenter(fromPoint);
        const end = this.getPointCenter(toPoint);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', start.x);
        line.setAttribute('y1', start.y);
        line.setAttribute('x2', end.x);
        line.setAttribute('y2', end.y);
        line.dataset.from = fromId;
        line.dataset.to = toId;

        this.svgContainer.appendChild(line);
        this.lines.push(line);
    }

    getPointCenter(point) {
        const rect = point.getBoundingClientRect();
        const svgRect = this.svgContainer.getBoundingClientRect();
        return {
            x: rect.left - svgRect.left + rect.width / 2,
            y: rect.top - svgRect.top + rect.height / 2
        };
    }

    removeElement(cellId) {
        const node = this.nodes.get(cellId);
        if (!node) return;

        // Remove from neighbors
        this.nodes.forEach(n => n.removeConnection(cellId));

        // Remove lines
        this.lines = this.lines.filter(line => {
            if (line.dataset.from === cellId || line.dataset.to === cellId) {
                line.remove();
                return false;
            }
            return true;
        });

        const cell = document.getElementById(cellId);
        cell.classList.remove('has-image');
        cell.style.backgroundImage = '';
        cell.querySelectorAll('.gate-point').forEach(p => p.remove());
        
        this.nodes.delete(cellId);
        this.propagateGlobal();
    }

    propagateGlobal() {
        this.nodes.forEach(node => {
            if (node.type === 'input') node.propagate();
        });
    }

    clear() {
        this.nodes.clear();
        this.lines.forEach(l => l.remove());
        this.lines = [];
        this.undoStack = [];
        this.initGrid();
    }

    async save(name) {
        const email = localStorage.getItem("userEmail");
        if (!email) throw new Error("User not logged in");

        const circuitData = {
            nodes: Array.from(this.nodes.values()).map(n => ({
                id: n.id,
                type: n.type,
                isOn: n.isOn
            })),
            connections: this.lines.map(l => ({
                from: l.dataset.from,
                to: l.dataset.to
            }))
        };

        const response = await fetch("/save-circuit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, name, data: circuitData })
        });
        return await response.json();
    }

    async load(name) {
        const email = localStorage.getItem("userEmail");
        const response = await fetch(`/load-circuit?email=${email}&name=${encodeURIComponent(name)}`);
        const { data } = await response.json();

        if (!data) return;

        this.clear();
        
        // Place nodes
        data.nodes.forEach(n => this.addElement(n.id, n.type, n.isOn));
        
        // Reconnect
        data.connections.forEach(c => this.connect(c.from, c.to));
        
        this.propagateGlobal();
    }
}

// Global Initialization
document.addEventListener('DOMContentLoaded', () => {
    const circuit = new CircuitManager(
        document.getElementById('grid-container'),
        document.getElementById('flowline-svg')
    );
    circuit.initGrid();

    // Event Listeners
    document.querySelectorAll('[id$="Gate"]').forEach(btn => {
        btn.addEventListener('click', () => {
            circuit.currentPlacementType = btn.id.replace('Gate', '').toLowerCase();
        });
    });

    document.getElementById('inputSwitchButton').addEventListener('click', () => {
        circuit.currentPlacementType = 'input';
    });

    document.getElementById('outputTerminalButton').addEventListener('click', () => {
        circuit.currentPlacementType = 'output';
    });

    document.getElementById('clearButton').addEventListener('click', () => circuit.clear());

    document.getElementById('deleteButton').addEventListener('click', function() {
        circuit.isDeleting = !circuit.isDeleting;
        this.classList.toggle('deleting', circuit.isDeleting);
    });

    document.getElementById('saveCircuitButton').addEventListener('click', async () => {
        const name = prompt("Circuit Name:");
        if (name) {
            try {
                const res = await circuit.save(name);
                alert(res.message);
            } catch (err) {
                alert(err.message);
            }
        }
    });

    document.getElementById('loadCircuitButton').addEventListener('click', async () => {
        const email = localStorage.getItem("userEmail");
        const res = await fetch(`/load-circuits?email=${email}`);
        const { circuits } = await res.json();
        const name = prompt("Select Circuit:\n" + circuits.join('\n'));
        if (name) {
             await circuit.load(name);
        }
    });
});
