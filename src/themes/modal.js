const Modal = (function () {
    let instance;
    let isOpen = false;
    let ms = ''
    let _params = {}
    let ids = {} // 缓存content header等

    function createModal(message, params = {}) {
        ms = message
        _params = params

        !ids[params.id] && (ids[params.id] = {
            header: params.header ? params.header : '',
            message: message,
            class: params.class ? params.class : ''
        })

        // 创建模态框 DOM 结构
        const modal = document.createElement('div');
        modal.classList.add('modal');
        modal.classList.add('modal-container');
        const modalContent = document.createElement('div');
        modalContent.classList.add('modal-content');

        const closeBtn = document.createElement('span');
        closeBtn.classList.add('close');
        closeBtn.innerHTML = '&times;';

        const messageEl = document.createElement('div');
        messageEl.classList.add('modal-content-body');
        // messageEl.textContent = message;
        if(message instanceof HTMLElement) {
            messageEl.appendChild(message)
        }
        if(typeof message === 'string') {
            messageEl.innerHTML = message
        }

        // const confirmBtn = document.createElement('div');
        // confirmBtn.classList.add('modal-content-');

        const modalHeader = document.createElement('div');
        const modalHeaderContent = document.createElement('div');
        modalHeaderContent.classList.add('moadal-header-content');
        modalHeaderContent.textContent = _params.header ? _params.header : ''
        modalHeader.classList.add('moadal-header');
        modalHeader.appendChild(modalHeaderContent);
        modalHeader.appendChild(closeBtn);

        modalContent.appendChild(modalHeader);
        // modalContent.appendChild(closeBtn);
        modalContent.appendChild(messageEl);
        // modalContent.appendChild(confirmBtn);

        modal.appendChild(modalContent);

        // 添加事件监听器
        closeBtn.addEventListener('click', function () {
            closeModal();
        });

        // confirmBtn.addEventListener('click', function () {
        //     closeModal();
        //     if (params.cb && typeof params.cb === 'function') {
        //         params.cb();
        //     }
        // });

        // 添加到文档中
        document.body.appendChild(modal);

        // 显示模态框
        modal.classList.add('fade-in');
        isOpen = true;
        // 禁止body滚动
        document.body.classList.add('overflow-hidden');

        if (params.cb && typeof params.cb === 'function') {
            params.cb(modal);
        }

        function closeModal() {
            modal.classList.add('fade-out');
            modal.querySelector('.modal-content').classList.add('slide-out');
            setTimeout(function () {
                modal.style.display = 'none';
                modal.classList.remove('fade-out');
                modal.querySelector('.modal-content').classList.remove('slide-out');
                isOpen = false;
                // 恢复body滚动
                document.body.classList.remove('overflow-hidden');
            }, 300);

            // 设置focus cell
            document.querySelector(".is-focused.is-secondarily-focused") && document.querySelector(".is-focused.is-secondarily-focused").focus()
        }

        // 按下 ESC 键关闭模态框
        document.addEventListener('keydown', function (e) {
            if (isOpen && e.keyCode === 27) {
                closeModal();
            }
        });

        // 点击模态框外部区域关闭模态框
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                closeModal();
            }
        });

        // 新调用更像content
        function updateMessage(newMessage) {
            ms = newMessage
            if(newMessage instanceof HTMLElement) {
                messageEl.innerHTML = ''
                messageEl.appendChild(newMessage)
            }
            if(typeof newMessage === 'string') {
                messageEl.innerHTML = newMessage
            }
        }

        function updateHeader(newMessage) {
            _params.header = newMessage || ''
            modalHeaderContent.innerHTML = newMessage;
        }

        function updateClass(newClass) {
            newClass = newClass ? newClass : 'no-class'
            modal.classList.remove(...modal.classList)
            modal.classList.add(newClass, 'fade-in', 'modal-container', 'modal');
        }

        function openModal(params) {
            updateClass(params.class)
            modal.style.display = 'flex';
            isOpen = true;
            // 禁止body滚动
            document.body.classList.add('overflow-hidden');
            document
            if (params.cb && typeof params.cb === 'function') {
                params.cb(modal);
            }
        }

        return {
            closeModal,
            openModal,
            updateMessage,
            updateHeader,
            updateClass
        };
    }

    return {
        getInstance: function (message, params = {}) {
            if (!instance) {
                instance = createModal(message, params);
                instance.updateClass(params.class)
            } else {
                !ids[params.id] && (ids[params.id] = {
                    header: params.header ? params.header : '',
                    message: message,
                    class: params.class ? params.class : ''
                })
                if (ids[params.id]) {
                    instance.updateMessage(ids[params.id].message)
                    instance.updateHeader(ids[params.id].header)
                } else {
                    if (ms !== message) {
                        instance.updateMessage(message)
                    }
                    if (params.header !== _params.header) {
                        instance.updateHeader(params.header)
                    }
                }
                instance.openModal(params)
            }
            return instance;
        }
    };
})();

export default Modal